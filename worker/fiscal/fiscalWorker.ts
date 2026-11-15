import { createHash } from "node:crypto";
import { getCodeSixDigitfromSignature } from "dgii-ecf";
import { classifyCertificateFailure } from "./certificateFailure";
import { isRfceDocument } from "./dgiiAdapters";
import { fiscalWorkerError, unknownToWorkerError } from "./errors";
import { createUnsignedEcfXml } from "./mapper";
import { withTimeout } from "./withTimeout";
import type {
  CertificateCustody,
  DgiiClientAdapter,
  DgiiPollResult,
  DgiiSubmitResult,
  EcfFiscalStatus,
  FiscalOutboxOperation,
  FiscalOutboxStatus,
  FiscalWorkerError,
  FiscalWorkerRepository,
  FiscalWorkerSnapshot,
  XmlSignerAdapter,
} from "./types";

/** The worker has no hard retry cap; a retryable certificate error is recorded from this attempt on. */
export const DEFAULT_CERTIFICATE_FAILURE_ATTEMPT_THRESHOLD = 5;

/** Default timeout for bounded job execution (submit/pollStatus) in milliseconds. */
export const DEFAULT_FISCAL_JOB_TIMEOUT_MS = 120_000;

export type ProcessJobResult =
  | { kind: "processed"; jobId: string; operation: FiscalOutboxOperation; status: EcfFiscalStatus }
  | { kind: "skipped"; reason: "already_done" | "locked"; jobId: string }
  | { kind: "failed"; jobId: string; retryable: boolean; code: string };

interface InvoiceFacturaView {
  ncf?: string;
  total?: number;
  tipoeCf?: number | string;
}

function readInvoiceFactura(snapshot: FiscalWorkerSnapshot): InvoiceFacturaView {
  const factura = snapshot.invoicePayload?.factura as
    | {
        ncf?: unknown;
        total?: unknown;
        tipoe_cf?: unknown;
        TipoeCF?: unknown;
      }
    | undefined;

  const ncf = typeof factura?.ncf === "string" ? factura.ncf.trim() : undefined;
  const total =
    typeof factura?.total === "number"
      ? factura.total
      : factura?.total != null && !Number.isNaN(Number(factura.total))
      ? Number(factura.total)
      : undefined;
  const rawTipoe = factura?.tipoe_cf ?? factura?.TipoeCF;
  const tipoeCf =
    typeof rawTipoe === "number" || typeof rawTipoe === "string"
      ? rawTipoe
      : ncf && /^E\d{2}/i.test(ncf)
      ? ncf.substring(1, 3)
      : undefined;

  return { ncf, total, tipoeCf };
}

export class FiscalWorker {
  constructor(
    private readonly deps: {
      repository: FiscalWorkerRepository;
      custody: CertificateCustody;
      signer: XmlSignerAdapter;
      dgii: DgiiClientAdapter;
      workerId: string;
      now?: () => Date;
      /** Retryable certificate errors are written to the certificate row only from this attempt on. */
      certificateFailureAttemptThreshold?: number;
      /** Maximum time allowed for submit / pollStatus execution before aborting with JOB_TIMEOUT. */
      jobTimeoutMs?: number;
    }
  ) {}

  get jobTimeoutMs(): number {
    return this.deps.jobTimeoutMs ?? DEFAULT_FISCAL_JOB_TIMEOUT_MS;
  }

  async processJob(jobId: string): Promise<ProcessJobResult> {
    const createdAt = this.nowIso();
    const claim = await this.deps.repository.claimJob(jobId, { workerId: this.deps.workerId, claimedAt: createdAt });

    if (claim.kind === "already_done" || claim.kind === "locked") {
      await this.audit({ eventType: "job_skipped", jobId, createdAt, metadata: { reason: claim.kind } });
      return { kind: "skipped", reason: claim.kind === "already_done" ? "already_done" : "locked", jobId };
    }

    const { snapshot } = claim;
    await this.auditForSnapshot("job_started", snapshot);

    try {
      this.assertTenantBoundary(snapshot);
      const timeoutMs = this.jobTimeoutMs;
      const timeoutSeconds = Math.round(timeoutMs / 1000);
      const execution =
        snapshot.job.operation === "poll_status" ? this.pollStatus(snapshot) : this.submit(snapshot);
      const status = await withTimeout(
        execution,
        timeoutMs,
        () =>
          fiscalWorkerError(
            "JOB_TIMEOUT",
            `Fiscal job exceeded ${timeoutSeconds}s and was aborted; it will be retried.`,
            true
          )
      );
      await this.deps.repository.updateJob(snapshot.job.id, { status: "done", errorMessage: null });
      await this.auditForSnapshot("job_completed", snapshot, { status });
      return { kind: "processed", jobId: snapshot.job.id, operation: snapshot.job.operation, status };
    } catch (error) {
      const workerError = unknownToWorkerError(error, "FISCAL_WORKER_FAILED", true);
      await this.recordCertificateFailure(snapshot, workerError);
      await this.failJob(snapshot, workerError);
      return { kind: "failed", jobId: snapshot.job.id, retryable: workerError.retryable, code: workerError.code };
    }
  }

  private async submit(snapshot: FiscalWorkerSnapshot): Promise<EcfFiscalStatus> {
    const certificateId = snapshot.certificate?.id ?? null;
    if (!snapshot.certificate?.isReady || !certificateId) {
      throw fiscalWorkerError("CERTIFICATE_NOT_READY", "Fiscal document has no ready certificate metadata.", false);
    }
    if (!snapshot.certificate.validUntil || new Date(snapshot.certificate.validUntil).getTime() <= this.now().getTime()) {
      throw fiscalWorkerError("CERTIFICATE_EXPIRED", "Fiscal certificate is expired at signing time.", false);
    }

    const signingMaterial = await this.deps.custody.getSigningMaterial({
      tenantId: snapshot.job.tenantId,
      certificateId,
      environment: snapshot.certificate.environment,
    });
    if (!signingMaterial.ok) throw signingMaterial.error;

    const unsignedXml = createUnsignedEcfXml(snapshot, this.now());
    const signed = await this.deps.signer.signXml({
      unsignedXml,
      certificate: signingMaterial.value,
      environment: snapshot.certificate.environment,
    });
    await this.clearCertificateFailure(snapshot.job.tenantId, certificateId);
    const xmlHash = createHash("sha256").update(signed.signedXml).digest("hex");
    const securityCode = this.resolveSecurityCode(signed.signedXml, xmlHash);

    await this.deps.repository.updateDocument(snapshot.document.id, {
      certificateMetadataId: certificateId,
      status: "signed",
      dgiiSecurityCode: securityCode,
      xmlHash,
      signedXmlStorageKey: signed.storageKey,
      lastError: null,
    });
    await this.auditForSnapshot("xml_signed", snapshot, { xmlHash });

    // If the process crashes after DGII accepts but before this worker persists the track id,
    // the safe retry path is to reuse the stable outbox idempotency key and let the DGII adapter
    // resolve duplicates. The repository prevents duplicate submits once a DGII outcome is stored.
    const dgiiResult = await this.deps.dgii.submitSignedXml({
      signedXml: signed.signedXml,
      environment: snapshot.certificate.environment,
      idempotencyKey: snapshot.job.idempotencyKey,
      certificate: signingMaterial.value,
    });
    return this.persistSubmissionResult(snapshot, dgiiResult);
  }

  private async pollStatus(snapshot: FiscalWorkerSnapshot): Promise<EcfFiscalStatus> {
    if (!snapshot.certificate) {
      throw fiscalWorkerError("CERTIFICATE_METADATA_REQUIRED", "DGII polling requires certificate environment metadata.", false);
    }
    if (!snapshot.document.dgiiTrackId) {
      throw fiscalWorkerError("DGII_TRACK_ID_REQUIRED", "DGII polling requires a track id.", false);
    }

    const certificateId = snapshot.certificate.id;
    if (!snapshot.certificate.isReady || !certificateId) {
      throw fiscalWorkerError("CERTIFICATE_NOT_READY", "Fiscal document has no ready certificate metadata.", false);
    }

    if (snapshot.document.certificateMetadataId && snapshot.document.certificateMetadataId !== certificateId) {
      throw fiscalWorkerError(
        "CERTIFICATE_ENVIRONMENT_CHANGED",
        "Document was submitted under a different e-CF environment than the tenant's current one; it cannot be polled.",
        false
      );
    }

    if (!snapshot.document.certificateMetadataId) {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        certificateMetadataId: certificateId,
      });
    }

    const signingMaterial = await this.deps.custody.getSigningMaterial({
      tenantId: snapshot.job.tenantId,
      certificateId,
      environment: snapshot.certificate.environment,
    });
    if (!signingMaterial.ok) throw signingMaterial.error;

    const factura = readInvoiceFactura(snapshot);

    const isRfce = isRfceDocument({
      rfceThresholdUsed: snapshot.document.rfce_threshold_used,
      tipoeCF: factura.tipoeCf,
      ncf: factura.ncf,
      total: factura.total,
    });

    const rncEmisor = String((snapshot.invoicePayload?.tenant as any)?.rnc ?? (snapshot.invoicePayload as any)?.rncEmisor ?? "");
    const encf = snapshot.document.dgiiTrackId ?? (factura.ncf ? String(factura.ncf) : "");
    const securityCode = snapshot.document.dgiiSecurityCode ?? undefined;

    const result = await this.deps.dgii.pollStatus({
      trackId: snapshot.document.dgiiTrackId,
      environment: snapshot.certificate.environment,
      idempotencyKey: snapshot.job.idempotencyKey,
      certificate: signingMaterial.value,
      isRfce,
      rncEmisor,
      encf,
      securityCode,
    });
    await this.auditForSnapshot("dgii_polled", snapshot, { kind: result.kind, statusCode: result.statusCode });
    return this.persistPollResult(snapshot, result);
  }

  private async persistSubmissionResult(snapshot: FiscalWorkerSnapshot, result: DgiiSubmitResult): Promise<EcfFiscalStatus> {
    const dgiiMessages = result.messages && result.messages.length > 0 ? result.messages : undefined;

    if (result.kind === "accepted") {
      const encf = result.trackId ?? (snapshot.invoicePayload?.factura as any)?.ncf ?? snapshot.document.dgiiTrackId;
      const nowIso = this.nowIso();
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "accepted",
        dgiiTrackId: encf ?? undefined,
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        ...(dgiiMessages ? { dgiiMessages } : {}),
        submittedAt: nowIso,
        acceptedAt: nowIso,
        lastError: null,
        rfceThresholdUsed: result.rfceThresholdUsed ?? null,
      });
      await this.auditForSnapshot("dgii_submitted", snapshot, { trackId: encf, statusCode: result.statusCode });
      return "accepted";
    }

    if (result.kind === "rejected") {
      const nowIso = this.nowIso();
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "rejected",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        ...(dgiiMessages ? { dgiiMessages } : {}),
        rejectedAt: nowIso,
        lastError: result.message,
        rfceThresholdUsed: result.rfceThresholdUsed ?? null,
      });
      await this.auditForSnapshot("dgii_submitted", snapshot, { statusCode: result.statusCode });
      return "rejected";
    }

    if (result.kind === "submitted") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "submitted",
        dgiiTrackId: result.trackId,
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        ...(dgiiMessages ? { dgiiMessages } : {}),
        submittedAt: this.nowIso(),
        lastError: null,
        rfceThresholdUsed: result.rfceThresholdUsed ?? null,
      });
      await this.auditForSnapshot("dgii_submitted", snapshot, { trackId: result.trackId, statusCode: result.statusCode });

      await this.deps.repository.enqueueJob?.({
        tenantId: snapshot.job.tenantId,
        ecfDocumentId: snapshot.document.id,
        facturaId: snapshot.job.facturaId,
        operation: "poll_status",
        idempotencyKey: `${snapshot.job.tenantId}:${result.trackId}:poll`,
      });

      return "submitted";
    }

    throw fiscalWorkerError(result.kind.toUpperCase(), result.message, result.kind === "retryable_error");
  }

  private async persistPollResult(snapshot: FiscalWorkerSnapshot, result: DgiiPollResult): Promise<EcfFiscalStatus> {
    if (snapshot.document.status === "accepted" || snapshot.document.status === "rejected") {
      await this.auditForSnapshot("job_skipped", snapshot, {
        reason: "terminal_status_preserved",
        currentStatus: snapshot.document.status,
        resultKind: result.kind,
      });
      return snapshot.document.status;
    }

    const dgiiMessages = result.messages && result.messages.length > 0 ? result.messages : undefined;

    if (result.kind === "accepted") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "accepted",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        ...(dgiiMessages ? { dgiiMessages } : {}),
        acceptedAt: this.nowIso(),
        lastError: null,
      });
      return "accepted";
    }

    if (result.kind === "rejected") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "rejected",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        ...(dgiiMessages ? { dgiiMessages } : {}),
        rejectedAt: this.nowIso(),
        lastError: result.message,
      });
      return "rejected";
    }

    if (result.kind === "submitted") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "submitted",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        ...(dgiiMessages ? { dgiiMessages } : {}),
      });
      return "submitted";
    }

    throw fiscalWorkerError(result.kind.toUpperCase(), result.message, result.kind === "retryable_error");
  }

  private assertTenantBoundary(snapshot: FiscalWorkerSnapshot): void {
    const tenantId = snapshot.job.tenantId;
    if (snapshot.document.tenantId !== tenantId || snapshot.document.facturaId !== snapshot.job.facturaId) {
      throw fiscalWorkerError("TENANT_MISMATCH", "Fiscal outbox job and e-CF document do not share tenant/invoice ownership.", false);
    }
    if (snapshot.certificate && snapshot.certificate.tenantId !== tenantId) {
      throw fiscalWorkerError("TENANT_MISMATCH", "Fiscal certificate metadata does not belong to the outbox tenant.", false);
    }
  }

  /** Best effort: a failure here is logged and never changes the job outcome. */
  private async recordCertificateFailure(snapshot: FiscalWorkerSnapshot, error: FiscalWorkerError): Promise<void> {
    const code = classifyCertificateFailure(error);
    const certificateId = snapshot.certificate?.id ?? snapshot.document.certificateMetadataId ?? null;
    if (!code || !certificateId || !this.deps.repository.recordCertificateFailure) return;
    // A transient (retryable) failure such as a storage hiccup must not flag the certificate as broken
    // while the job can still recover; only write it once the retries reach the threshold.
    const threshold = this.deps.certificateFailureAttemptThreshold ?? DEFAULT_CERTIFICATE_FAILURE_ATTEMPT_THRESHOLD;
    if (error.retryable && snapshot.job.attempts + 1 < threshold) return;
    try {
      await this.deps.repository.recordCertificateFailure({ tenantId: snapshot.job.tenantId, certificateId }, code);
    } catch (writeError) {
      console.error("[fiscal-worker] could not record certificate failure", { code, error: writeError instanceof Error ? writeError.name : "unknown" });
    }
  }

  private async clearCertificateFailure(tenantId: string, certificateId: string): Promise<void> {
    if (!this.deps.repository.clearCertificateFailure) return;
    try {
      await this.deps.repository.clearCertificateFailure({ tenantId, certificateId });
    } catch (clearError) {
      console.error("[fiscal-worker] could not clear certificate failure", { error: clearError instanceof Error ? clearError.name : "unknown" });
    }
  }

  private async failJob(snapshot: FiscalWorkerSnapshot, error: FiscalWorkerError): Promise<void> {
    const isConfigError = error.code === "FISCAL_CONFIGURATION_INCOMPLETE";
    const outboxStatus: FiscalOutboxStatus = isConfigError ? "blocked_configuration" : (error.retryable ? "retryable_error" : "terminal_error");
    const documentStatus: EcfFiscalStatus = isConfigError ? "pending_configuration" : (error.retryable ? "retryable_error" : "terminal_error");
    const message = error.message?.trim() || "Unknown fiscal worker error";

    await this.deps.repository.updateJob(snapshot.job.id, {
      status: outboxStatus,
      attempts: snapshot.job.attempts + 1,
      nextAttemptAt: error.retryable && !isConfigError ? this.nextAttemptIso(snapshot.job.attempts + 1) : undefined,
      errorMessage: message,
    });
    if (
      error.code !== "CERTIFICATE_ENVIRONMENT_CHANGED" &&
      snapshot.document.status !== "accepted" &&
      snapshot.document.status !== "rejected"
    ) {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: documentStatus,
        lastError: message,
        dgiiStatusMessage: message,
      });
    }
    await this.auditForSnapshot("job_failed", snapshot, { code: error.code, retryable: error.retryable });
  }

  private async auditForSnapshot(
    eventType: Parameters<FiscalWorkerRepository["recordAudit"]>[0]["eventType"],
    snapshot: FiscalWorkerSnapshot,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.audit({
      eventType,
      jobId: snapshot.job.id,
      tenantId: snapshot.job.tenantId,
      ecfDocumentId: snapshot.document.id,
      createdAt: this.nowIso(),
      metadata,
    });
  }

  private async audit(event: Omit<Parameters<FiscalWorkerRepository["recordAudit"]>[0], "workerId">): Promise<void> {
    await this.deps.repository.recordAudit({ ...event, workerId: this.deps.workerId });
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private nextAttemptIso(attempts: number): string {
    const delayMs = Math.min(60 * 60 * 1000, 2 ** Math.max(0, attempts - 1) * 60 * 1000);
    return new Date(this.now().getTime() + delayMs).toISOString();
  }

  private resolveSecurityCode(signedXml: string, xmlHash: string): string {
    try {
      const resolved = getCodeSixDigitfromSignature(signedXml);
      if (typeof resolved === "string" && resolved.trim() !== "") return resolved.trim();
    } catch {
      // Fallback only allowed in non-production environments
    }

    if (process.env.NODE_ENV === "production") {
      throw fiscalWorkerError("SECURITY_CODE_ERROR", "Failed to extract DGII Security Code from XML signature. Fallback is disabled in production.", false);
    }

    const digits = xmlHash.replace(/\D/g, "");
    return (digits.slice(0, 6) || xmlHash.slice(0, 6).replace(/[^a-zA-Z0-9]/g, "")).padEnd(6, "0");
  }
}


