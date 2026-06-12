import { createRequire } from "node:module";
import type {
  CertificateMetadataSnapshot,
  ClaimJobResult,
  EcfDocumentSnapshot,
  EcfFiscalStatus,
  FiscalAuditEvent,
  FiscalOutboxJob,
  FiscalOutboxOperation,
  FiscalOutboxStatus,
  FiscalWorkerRepository,
  FiscalWorkerSnapshot,
} from "./types";

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresFiscalWorkerRepositoryOptions {
  db: Queryable;
  lockTtlMs?: number;
}

type ClaimRow = {
  job_id: string;
  job_tenant_id: string;
  ecf_document_id: string;
  factura_id: string;
  operation: FiscalOutboxOperation;
  job_status: FiscalOutboxStatus;
  attempts: number;
  next_attempt_at: Date | string | null;
  idempotency_key: string;
  document_id: string;
  document_tenant_id: string;
  document_factura_id: string;
  document_status: EcfFiscalStatus;
  certificate_metadata_id: string | null;
  dgii_track_id: string | null;
  rfce_threshold_used: number | string | null;
  rejection_scope: "individual" | "batch" | null;
  batch_id: string | null;
  certificate_id: string | null;
  certificate_tenant_id: string | null;
  certificate_environment: CertificateMetadataSnapshot["environment"] | null;
  certificate_is_ready: boolean | null;
  certificate_valid_until: Date | string | null;
  invoice_payload: Record<string, unknown> | null;
};

export class PostgresFiscalWorkerRepository implements FiscalWorkerRepository {
  private readonly lockTtlMs: number;

  constructor(private readonly options: PostgresFiscalWorkerRepositoryOptions) {
    this.lockTtlMs = options.lockTtlMs ?? 5 * 60 * 1000;
  }

  async claimJob(jobId: string, claim: { workerId: string; claimedAt: string }): Promise<ClaimJobResult> {
    const claimedAt = new Date(claim.claimedAt);
    const expiredBefore = new Date(claimedAt.getTime() - this.lockTtlMs).toISOString();
    const result = await this.options.db.query<ClaimRow>(CLAIM_JOB_SQL, [jobId, claim.claimedAt, expiredBefore, claim.workerId]);

    if (result.rows[0]) {
      return { kind: "claimed", snapshot: rowToSnapshot(result.rows[0]) };
    }

    const state = await this.options.db.query<{
      status: FiscalOutboxStatus;
      locked_by: string | null;
      locked_at: Date | string | null;
      next_attempt_at: Date | string | null;
      operation: FiscalOutboxOperation;
      document_status: EcfFiscalStatus | null;
    }>(
      `
        SELECT fo.status, fo.locked_by, fo.locked_at, fo.next_attempt_at, fo.operation, ed.status AS document_status
        FROM public.fiscal_outbox fo
        LEFT JOIN public.ecf_documents ed ON ed.id = fo.ecf_document_id
        WHERE fo.id = $1
      `,
      [jobId]
    );
    const row = state.rows[0];
    if (!row) return { kind: "locked", jobId };
    if (row.status === "done" || isAlreadySubmitted(row.operation, row.document_status)) return { kind: "already_done", jobId };
    return { kind: "locked", jobId, lockedBy: row.locked_by };
  }

  async findNextRunnableJob(now: string): Promise<string | null> {
    const expiredBefore = new Date(new Date(now).getTime() - this.lockTtlMs).toISOString();
    const result = await this.options.db.query<{ id: string }>(
      `
        SELECT fo.id
        FROM public.fiscal_outbox fo
        JOIN public.ecf_documents ed ON ed.id = fo.ecf_document_id
        WHERE fo.status IN ('queued', 'retryable_error', 'processing')
          AND fo.next_attempt_at <= $1::timestamptz
          AND (fo.status <> 'processing' OR fo.locked_at IS NULL OR fo.locked_at < $2::timestamptz)
          AND NOT (fo.operation IN ('submit', 'resubmit') AND ed.status IN ('submitted', 'accepted', 'rejected'))
        ORDER BY fo.next_attempt_at ASC, fo.created_at ASC
        LIMIT 1
      `,
      [now, expiredBefore]
    );
    return result.rows[0]?.id ?? null;
  }

  async updateDocument(documentId: string, update: Parameters<FiscalWorkerRepository["updateDocument"]>[1]): Promise<void> {
    await updateByWhitelist(this.options.db, "public.ecf_documents", documentId, update, {
      status: "status",
      certificateMetadataId: "certificate_metadata_id",
      xmlHash: "xml_hash",
      signedXmlStorageKey: "signed_xml_storage_key",
      dgiiTrackId: "dgii_track_id",
      dgiiSecurityCode: "dgii_security_code",
      dgiiStatusCode: "dgii_status_code",
      dgiiStatusMessage: "dgii_status_message",
      submittedAt: "submitted_at",
      acceptedAt: "accepted_at",
      rejectedAt: "rejected_at",
      lastError: "last_error",
      rfceThresholdUsed: "rfce_threshold_used",
      rejectionScope: "rejection_scope",
      batchId: "batch_id",
    });
  }

  async updateJob(jobId: string, update: Parameters<FiscalWorkerRepository["updateJob"]>[1]): Promise<void> {
    await updateByWhitelist(this.options.db, "public.fiscal_outbox", jobId, update, {
      status: "status",
      attempts: "attempts",
      nextAttemptAt: "next_attempt_at",
      errorMessage: "error_message",
    });
  }

  async recordAudit(event: FiscalAuditEvent): Promise<void> {
    await this.options.db.query(
      `
        INSERT INTO public.ecf_document_events
          (tenant_id, ecf_document_id, to_status, reason, metadata, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
      `,
      [
        event.tenantId ?? null,
        event.ecfDocumentId ?? null,
        auditEventToStatus(event.eventType),
        event.eventType,
        JSON.stringify({ ...(event.metadata ?? {}), jobId: event.jobId }),
        `fiscal-worker:${event.workerId}`,
        event.createdAt,
      ]
    );
  }

  async enqueueJob(job: {
    tenantId: string;
    ecfDocumentId: string;
    facturaId: string;
    operation: FiscalOutboxOperation;
    idempotencyKey: string;
  }): Promise<void> {
    await this.options.db.query(
      `
        INSERT INTO public.fiscal_outbox
          (tenant_id, ecf_document_id, factura_id, operation, status, idempotency_key, attempts, next_attempt_at)
        VALUES ($1, $2, $3, $4, 'queued', $5, 0, now())
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        job.tenantId,
        job.ecfDocumentId,
        job.facturaId,
        job.operation,
        job.idempotencyKey,
      ]
    );
  }
}

export function createProjectAdminPgPoolFromEnv(env: NodeJS.ProcessEnv = process.env): Queryable {
  const connectionString = env.FISCAL_WORKER_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("Missing FISCAL_WORKER_DATABASE_URL or DATABASE_URL for the Node fiscal worker project_admin connection.");
  }
  if (!/project_admin/i.test(connectionString) && env.FISCAL_WORKER_ALLOW_NON_PROJECT_ADMIN !== "true") {
    throw new Error("Fiscal worker database URL must use project_admin credentials, or set FISCAL_WORKER_ALLOW_NON_PROJECT_ADMIN=true for local tests only.");
  }
  const require = createRequire(import.meta.url);
  const { Pool } = require("pg") as { Pool: new (options: { connectionString: string }) => Queryable };
  return new Pool({ connectionString });
}

export const CLAIM_JOB_SQL = `
  WITH candidate AS (
    SELECT
      fo.id,
      ed.id AS document_id,
      ed.tenant_id AS document_tenant_id,
      ed.factura_id AS document_factura_id,
      ed.status AS document_status,
      ed.certificate_metadata_id,
      ed.dgii_track_id,
      ed.rfce_threshold_used,
      ed.rejection_scope,
      ed.batch_id,
      cm.id AS certificate_id,
      cm.tenant_id AS certificate_tenant_id,
      cm.environment AS certificate_environment,
      cm.is_ready AS certificate_is_ready,
      cm.valid_until AS certificate_valid_until,
      (
        SELECT jsonb_build_object(
          'factura', to_jsonb(f.*),
          'tenant', to_jsonb(t.*),
          'items', COALESCE(f.items, '[]'::jsonb),
          'payments', COALESCE(
            CASE 
              WHEN f.metodo_pago IS NOT NULL THEN
                jsonb_build_array(
                  jsonb_build_object(
                    'payment_method', f.metodo_pago,
                    'amount', f.total
                  )
                )
              ELSE '[]'::jsonb
            END,
            '[]'::jsonb
          )
        )
      ) AS invoice_payload
    FROM public.fiscal_outbox fo
    JOIN public.ecf_documents ed ON ed.id = fo.ecf_document_id
    JOIN public.tenants t ON t.id = fo.tenant_id
    LEFT JOIN LATERAL (
      SELECT cm.*
      FROM public.ecf_certificate_metadata cm
      WHERE cm.tenant_id = ed.tenant_id
        AND cm.is_ready IS TRUE
        AND (ed.certificate_metadata_id IS NULL OR cm.id = ed.certificate_metadata_id)
      ORDER BY cm.valid_until DESC NULLS LAST, cm.created_at DESC
      LIMIT 1
    ) cm ON true
    JOIN public.facturas f ON f.id = fo.factura_id
    WHERE fo.id = $1
      AND fo.status IN ('queued', 'retryable_error', 'processing')
      AND fo.next_attempt_at <= $2::timestamptz
      AND (fo.status <> 'processing' OR fo.locked_at IS NULL OR fo.locked_at < $3::timestamptz)
      AND NOT (fo.operation IN ('submit', 'resubmit') AND ed.status IN ('submitted', 'accepted', 'rejected'))
    FOR UPDATE OF fo SKIP LOCKED
  )
  UPDATE public.fiscal_outbox fo
  SET status = 'processing', locked_by = $4, locked_at = $2::timestamptz, updated_at = $2::timestamptz
  FROM candidate
  WHERE fo.id = candidate.id
  RETURNING
    fo.id AS job_id,
    fo.tenant_id AS job_tenant_id,
    fo.ecf_document_id,
    fo.factura_id,
    fo.operation,
    fo.status AS job_status,
    fo.attempts,
    fo.next_attempt_at,
    fo.idempotency_key,
    candidate.document_id,
    candidate.document_tenant_id,
    candidate.document_factura_id,
    candidate.document_status,
    candidate.certificate_metadata_id,
    candidate.dgii_track_id,
    candidate.rfce_threshold_used,
    candidate.rejection_scope,
    candidate.batch_id,
    candidate.certificate_id,
    candidate.certificate_tenant_id,
    candidate.certificate_environment,
    candidate.certificate_is_ready,
    candidate.certificate_valid_until,
    candidate.invoice_payload
`;

function rowToSnapshot(row: ClaimRow): FiscalWorkerSnapshot {
  return {
    job: {
      id: row.job_id,
      tenantId: row.job_tenant_id,
      ecfDocumentId: row.ecf_document_id,
      facturaId: row.factura_id,
      operation: row.operation,
      status: row.job_status,
      attempts: row.attempts,
      nextAttemptAt: toIsoOrUndefined(row.next_attempt_at),
      idempotencyKey: row.idempotency_key,
    },
    document: {
      id: row.document_id,
      tenantId: row.document_tenant_id,
      facturaId: row.document_factura_id,
      status: row.document_status,
      certificateMetadataId: row.certificate_metadata_id,
      dgiiTrackId: row.dgii_track_id,
      rfce_threshold_used: row.rfce_threshold_used !== null && row.rfce_threshold_used !== undefined ? Number(row.rfce_threshold_used) : null,
      rejection_scope: row.rejection_scope,
      batchId: row.batch_id,
    },
    certificate: row.certificate_id
      ? {
          id: row.certificate_id,
          tenantId: row.certificate_tenant_id ?? "",
          environment: row.certificate_environment ?? "certification",
          isReady: row.certificate_is_ready === true,
          validUntil: toIsoOrNull(row.certificate_valid_until),
        }
      : null,
    invoicePayload: row.invoice_payload ?? {},
  };
}

async function updateByWhitelist(
  db: Queryable,
  table: string,
  id: string,
  update: Record<string, unknown>,
  columns: Record<string, string>
): Promise<void> {
  const entries = Object.entries(update).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);
  if (assignments.some((assignment) => assignment.startsWith("undefined"))) {
    throw new Error("Unsupported fiscal worker repository update field.");
  }
  const values = entries.map(([, value]) => value);
  await db.query(`UPDATE ${table} SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

function auditEventToStatus(eventType: FiscalAuditEvent["eventType"]): EcfFiscalStatus {
  if (eventType === "xml_signed") return "signed";
  if (eventType === "dgii_submitted") return "submitted";
  if (eventType === "job_failed") return "retryable_error";
  return "queued";
}

function isAlreadySubmitted(operation: FiscalOutboxOperation, documentStatus: EcfFiscalStatus | null): boolean {
  return (operation === "submit" || operation === "resubmit") && ["submitted", "accepted", "rejected"].includes(documentStatus ?? "");
}

function toIsoOrUndefined(value: Date | string | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
