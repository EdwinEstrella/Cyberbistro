import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FiscalWorker } from "../worker/fiscal/fiscalWorker";
import type {
  CertificateCustody,
  DgiiClientAdapter,
  FiscalAuditEvent,
  FiscalWorkerRepository,
  FiscalWorkerSnapshot,
  SigningMaterial,
  XmlSignerAdapter,
} from "../worker/fiscal/types";

const now = new Date("2026-06-10T12:00:00.000Z");

function baseSnapshot(overrides: Partial<FiscalWorkerSnapshot> = {}): FiscalWorkerSnapshot {
  return {
    job: {
      id: "job-1",
      tenantId: "tenant-1",
      ecfDocumentId: "doc-1",
      facturaId: "invoice-1",
      operation: "submit",
      status: "queued",
      attempts: 0,
      idempotencyKey: "tenant-1:invoice-1:submit",
    },
    document: {
      id: "doc-1",
      tenantId: "tenant-1",
      facturaId: "invoice-1",
      status: "queued",
      certificateMetadataId: "cert-1",
      dgiiTrackId: null,
    },
    certificate: {
      id: "cert-1",
      tenantId: "tenant-1",
      environment: "certification",
      isReady: true,
      validUntil: "2027-01-01T00:00:00.000Z",
    },
    invoicePayload: { subtotal: 100, tax: 18, total: 118 },
    ...overrides,
  };
}

function createRepository(snapshot: FiscalWorkerSnapshot): FiscalWorkerRepository & {
  auditEvents: FiscalAuditEvent[];
  documentUpdates: Array<Record<string, unknown>>;
  jobUpdates: Array<Record<string, unknown>>;
} {
  const auditEvents: FiscalAuditEvent[] = [];
  const documentUpdates: Array<Record<string, unknown>> = [];
  const jobUpdates: Array<Record<string, unknown>> = [];

  return {
    auditEvents,
    documentUpdates,
    jobUpdates,
    claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot }),
    recordAudit: vi.fn(async (event) => {
      auditEvents.push(event);
    }),
    updateDocument: vi.fn(async (_documentId, update) => {
      documentUpdates.push(update);
    }),
    updateJob: vi.fn(async (_jobId, update) => {
      jobUpdates.push(update);
    }),
  };
}

const custody: CertificateCustody = {
  getSigningMaterial: vi.fn(async () => ({
    ok: true,
    value: {
      certificateId: "cert-1",
      tenantId: "tenant-1",
      environment: "certification",
      p12Bytes: new Uint8Array([1, 2, 3]),
      passphrase: "secret",
    } satisfies SigningMaterial,
  }) as const),
};

describe("FiscalWorker", () => {
  it("claims a queued submission job, signs XML, submits to DGII, and audits the lifecycle", async () => {
    const repository = createRepository(baseSnapshot());
    const signer: XmlSignerAdapter = {
      signXml: vi.fn(async ({ unsignedXml }) => ({ signedXml: `<Signed>${unsignedXml}</Signed>` })),
    };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({ kind: "submitted", trackId: "TRK-123", statusCode: "REC" }) as const),
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({ repository, custody, signer, dgii, workerId: "worker-a", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "processed", jobId: "job-1", operation: "submit", status: "submitted" });
    expect(signer.signXml).toHaveBeenCalledWith(expect.objectContaining({ environment: "certification" }));
    expect(dgii.submitSignedXml).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "tenant-1:invoice-1:submit" }));
    expect(repository.documentUpdates).toContainEqual(expect.objectContaining({ status: "signed" }));
    expect(repository.documentUpdates).toContainEqual(expect.objectContaining({ status: "submitted", dgiiTrackId: "TRK-123" }));
    expect(repository.jobUpdates).toContainEqual(expect.objectContaining({ status: "done" }));
    expect(repository.auditEvents.map((event) => event.eventType)).toEqual(["job_started", "xml_signed", "dgii_submitted", "job_completed"]);
  });

  it("polls DGII status and records acceptance only from an accepted DGII response", async () => {
    const base = baseSnapshot();
    const repository = createRepository(
      baseSnapshot({
        job: { ...base.job, operation: "poll_status", idempotencyKey: "tenant-1:doc-1:poll" },
        document: { ...base.document, status: "submitted", dgiiTrackId: "TRK-123" },
      })
    );
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn() },
      dgii: {
        submitSignedXml: vi.fn(),
        pollStatus: vi.fn(async () => ({ kind: "accepted", statusCode: "ACE", message: "Accepted" }) as const),
      },
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "processed", jobId: "job-1", operation: "poll_status", status: "accepted" });
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({ status: "accepted", dgiiStatusCode: "ACE", acceptedAt: now.toISOString() })
    );
  });

  it("skips already completed jobs without submitting a duplicate DGII request", async () => {
    const repository = createRepository(baseSnapshot());
    vi.mocked(repository.claimJob).mockResolvedValueOnce({ kind: "already_done", jobId: "job-1" });
    const dgii: DgiiClientAdapter = { submitSignedXml: vi.fn(), pollStatus: vi.fn() };
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn() },
      dgii,
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "skipped", reason: "already_done", jobId: "job-1" });
    expect(dgii.submitSignedXml).not.toHaveBeenCalled();
    expect(repository.auditEvents).toEqual([expect.objectContaining({ eventType: "job_skipped", jobId: "job-1" })]);
  });

  it("rejects wrong-tenant fiscal material before signing or submission", async () => {
    const base = baseSnapshot();
    if (!base.certificate) throw new Error("expected base certificate");
    const snapshot = baseSnapshot({ certificate: { ...base.certificate, tenantId: "other-tenant" } });
    const repository = createRepository(snapshot);
    const signer: XmlSignerAdapter = { signXml: vi.fn() };
    const dgii: DgiiClientAdapter = { submitSignedXml: vi.fn(), pollStatus: vi.fn() };
    const worker = new FiscalWorker({ repository, custody, signer, dgii, workerId: "worker-a", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "failed", jobId: "job-1", retryable: false, code: "TENANT_MISMATCH" });
    expect(signer.signXml).not.toHaveBeenCalled();
    expect(dgii.submitSignedXml).not.toHaveBeenCalled();
    expect(repository.jobUpdates).toContainEqual(expect.objectContaining({ status: "terminal_error" }));
    expect(repository.auditEvents.map((event) => event.eventType)).toContain("job_failed");
  });

  it("rejects certificates that expired before signing time", async () => {
    const base = baseSnapshot();
    if (!base.certificate) throw new Error("expected base certificate");
    const repository = createRepository(baseSnapshot({ certificate: { ...base.certificate, validUntil: "2026-01-01T00:00:00.000Z" } }));
    const signer: XmlSignerAdapter = { signXml: vi.fn() };
    const dgii: DgiiClientAdapter = { submitSignedXml: vi.fn(), pollStatus: vi.fn() };
    const worker = new FiscalWorker({ repository, custody, signer, dgii, workerId: "worker-a", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "failed", jobId: "job-1", retryable: false, code: "CERTIFICATE_EXPIRED" });
    expect(signer.signXml).not.toHaveBeenCalled();
    expect(dgii.submitSignedXml).not.toHaveBeenCalled();
    expect(repository.jobUpdates).toContainEqual(expect.objectContaining({ status: "terminal_error" }));
  });

  it("schedules retryable failures with exponential nextAttemptAt backoff", async () => {
    const base = baseSnapshot();
    const repository = createRepository(baseSnapshot({ job: { ...base.job, attempts: 2 } }));
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn(async () => ({ signedXml: "<Signed />" })) },
      dgii: { submitSignedXml: vi.fn(async () => ({ kind: "retryable_error", message: "DGII timeout" }) as const), pollStatus: vi.fn() },
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "failed", jobId: "job-1", retryable: true, code: "RETRYABLE_ERROR" });
    expect(repository.jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "retryable_error",
        attempts: 3,
        nextAttemptAt: "2026-06-10T12:04:00.000Z",
      })
    );
  });

  it("hashes signed XML deterministically for idempotent document updates", async () => {
    const repository = createRepository(baseSnapshot());
    const signedXml = "<Signed>stable</Signed>";
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn(async () => ({ signedXml })) },
      dgii: { submitSignedXml: vi.fn(async () => ({ kind: "submitted", trackId: "TRK-123" }) as const), pollStatus: vi.fn() },
      workerId: "worker-a",
      now: () => now,
    });

    await worker.processJob("job-1");

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({ xmlHash: createHash("sha256").update(signedXml).digest("hex") })
    );
  });
});
