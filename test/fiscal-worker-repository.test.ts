import { describe, expect, it, vi } from "vitest";
import {
  CLAIM_JOB_SQL,
  PostgresFiscalWorkerRepository,
  createProjectAdminPgPoolFromEnv,
  type Queryable,
} from "../worker/fiscal/postgresFiscalWorkerRepository";

const claimRow = {
  job_id: "job-1",
  job_tenant_id: "tenant-1",
  ecf_document_id: "doc-1",
  factura_id: "invoice-1",
  operation: "submit" as const,
  job_status: "processing" as const,
  attempts: 1,
  next_attempt_at: new Date("2026-06-10T12:00:00.000Z"),
  idempotency_key: "tenant-1:invoice-1:submit",
  document_id: "doc-1",
  document_tenant_id: "tenant-1",
  document_factura_id: "invoice-1",
  document_status: "queued" as const,
  certificate_metadata_id: "cert-1",
  dgii_track_id: null,
  certificate_id: "cert-1",
  certificate_tenant_id: "tenant-1",
  certificate_environment: "certification" as const,
  certificate_is_ready: true,
  certificate_valid_until: new Date("2027-01-01T00:00:00.000Z"),
  invoice_payload: { total: 118 },
};

describe("PostgresFiscalWorkerRepository", () => {
  it("claims jobs with one SKIP LOCKED update guarded by due time, expired locks, and submitted documents", async () => {
    const db = { query: vi.fn(async () => ({ rows: [claimRow] })) } as unknown as Queryable;
    const repository = new PostgresFiscalWorkerRepository({ db, lockTtlMs: 60_000 });

    const result = await repository.claimJob("job-1", {
      workerId: "worker-a",
      claimedAt: "2026-06-10T12:00:00.000Z",
    });

    expect(result.kind).toBe("claimed");
    expect(CLAIM_JOB_SQL).toContain("FOR UPDATE OF fo SKIP LOCKED");
    expect(CLAIM_JOB_SQL).toContain("LEFT JOIN LATERAL");
    expect(CLAIM_JOB_SQL).toContain("ed.certificate_metadata_id IS NULL OR cm.id = ed.certificate_metadata_id");
    expect(CLAIM_JOB_SQL).toContain("fo.next_attempt_at <= $2::timestamptz");
    expect(CLAIM_JOB_SQL).toContain("fo.locked_at < $3::timestamptz");
    expect(CLAIM_JOB_SQL).toContain("NOT (fo.operation IN ('submit', 'resubmit') AND ed.status IN ('submitted', 'accepted', 'rejected'))");
    expect(vi.mocked(db.query)).toHaveBeenCalledWith(expect.stringContaining("UPDATE public.fiscal_outbox"), [
      "job-1",
      "2026-06-10T12:00:00.000Z",
      "2026-06-10T11:59:00.000Z",
      "worker-a",
    ]);
  });

  it("treats a submit job whose document already has a DGII outcome as already done", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              status: "queued",
              locked_by: null,
              locked_at: null,
              next_attempt_at: "2026-06-10T12:00:00.000Z",
              operation: "submit",
              document_status: "submitted",
            },
          ],
        }),
    } as unknown as Queryable;
    const repository = new PostgresFiscalWorkerRepository({ db });

    await expect(
      repository.claimJob("job-1", { workerId: "worker-b", claimedAt: "2026-06-10T12:00:00.000Z" })
    ).resolves.toEqual({ kind: "already_done", jobId: "job-1" });
  });

  it("requires project_admin database configuration for the executable worker boundary", () => {
    expect(() => createProjectAdminPgPoolFromEnv({})).toThrow(/Missing FISCAL_WORKER_DATABASE_URL/);
    expect(() => createProjectAdminPgPoolFromEnv({ FISCAL_WORKER_DATABASE_URL: "postgres://app:pw@localhost/db" })).toThrow(
      /project_admin/
    );
  });
});
