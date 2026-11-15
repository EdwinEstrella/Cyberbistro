import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FiscalWorker } from "../worker/fiscal/fiscalWorker";
import { FiscalWorkerRuntime } from "../worker/fiscal/fiscalWorkerRuntime";
import { withTimeout } from "../worker/fiscal/withTimeout";
import { createUnsignedEcfXml } from "../worker/fiscal/mapper";
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
    ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "31-12-2027" } },
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
    invoicePayload: {
      factura: {
        total: 118,
        itbis: 18,
        subtotal: 100,
        created_at: "2026-06-10T12:00:00.000Z",
        cliente_rnc: "123456789",
        cliente_nombre: "Test Client",
        ncf: "E310000000001",
      },
      tenant: {
        rnc: "130862346",
        nombre_negocio: "CYBERBISTRO SRL",
        direccion: "Av. Winston Churchill",
        telefono: "8095555555",
        email: "info@cyberbistro.app",
        ecf_issuer_sucursal: "Principal",
        ecf_issuer_municipio: "Santo Domingo Centro",
        ecf_issuer_provincia: "Distrito Nacional",
        ecf_issuer_actividad_economica: "6201",
        ecf_issuer_correo_emisor: "factura@cyberbistro.app",
        ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "31-12-2027" } },
      },
      items: [],
      payments: [],
    },
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
    expect(signer.signXml).toHaveBeenCalledWith(expect.objectContaining({ unsignedXml: createUnsignedEcfXml(baseSnapshot(), now) }));
    expect(dgii.submitSignedXml).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "tenant-1:invoice-1:submit" }));
    expect(repository.documentUpdates).toContainEqual(expect.objectContaining({ status: "signed" }));
    expect(repository.documentUpdates).toContainEqual(expect.objectContaining({ status: "signed", dgiiSecurityCode: expect.any(String) }));
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

  it("records DGII rejections as visible rejected fiscal state", async () => {
    const base = baseSnapshot();
    const repository = createRepository(
      baseSnapshot({
        job: { ...base.job, operation: "poll_status", idempotencyKey: "tenant-1:doc-1:poll" },
        document: { ...base.document, status: "submitted", dgiiTrackId: "TRK-REJECTED" },
      })
    );
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn() },
      dgii: {
        submitSignedXml: vi.fn(),
        pollStatus: vi.fn(async () => ({ kind: "rejected", statusCode: "RCH", message: "RNC mismatch" }) as const),
      },
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "processed", jobId: "job-1", operation: "poll_status", status: "rejected" });
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "rejected",
        dgiiStatusCode: "RCH",
        dgiiStatusMessage: "RNC mismatch",
        rejectedAt: now.toISOString(),
        lastError: "RNC mismatch",
      })
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

  it("times out and schedules retryable failure when DGII adapter never resolves", async () => {
    const repository = createRepository(baseSnapshot());
    const signer: XmlSignerAdapter = { signXml: vi.fn(async () => ({ signedXml: "<Signed />" })) };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(() => new Promise(() => {})), // never settles
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({
      repository,
      custody,
      signer,
      dgii,
      workerId: "worker-a",
      jobTimeoutMs: 50,
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({
      kind: "failed",
      jobId: "job-1",
      retryable: true,
      code: "JOB_TIMEOUT",
    });
    expect(repository.jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "retryable_error",
        attempts: 1,
        errorMessage: expect.stringContaining("aborted; it will be retried."),
      })
    );
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "retryable_error",
        lastError: expect.stringContaining("aborted; it will be retried."),
      })
    );
  });

  it("runtime loop continues to process subsequent jobs if a job hangs past runtime timeout", async () => {
    const jobsProcessed: string[] = [];
    const repository: FiscalWorkerRepository = {
      claimJob: vi.fn(),
      updateDocument: vi.fn(),
      updateJob: vi.fn(),
      recordAudit: vi.fn(),
      findNextRunnableJob: vi.fn()
        .mockResolvedValueOnce("job-1")
        .mockResolvedValueOnce("job-2")
        .mockResolvedValue(null),
    };

    const worker = {
      jobTimeoutMs: 20,
      processJob: vi.fn(async (jobId: string) => {
        jobsProcessed.push(jobId);
        if (jobId === "job-1") {
          return new Promise<never>(() => {});
        }
        return { kind: "processed", jobId, operation: "submit", status: "accepted" } as const;
      }),
    } as unknown as FiscalWorker;

    const runtime = new FiscalWorkerRuntime({
      repository,
      worker,
      pollIntervalMs: 5,
      jobTimeoutMs: 20,
    });

    vi.useFakeTimers();
    try {
      const runPromise = runtime.runForever();
      await vi.advanceTimersByTimeAsync(10);
      expect(jobsProcessed).toEqual(["job-1"]);

      // Advance past outer runtime timeout (20 + 30_000ms) + pollIntervalMs
      await vi.advanceTimersByTimeAsync(30_050);

      expect(jobsProcessed).toEqual(["job-1", "job-2"]);
      runtime.stop();
      await vi.advanceTimersByTimeAsync(10);
      await runPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  describe("withTimeout", () => {
    it("clears its timer when the promise settles first", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      try {
        const fastPromise = Promise.resolve("done");
        const result = await withTimeout(fastPromise, 10_000, () => new Error("timeout"));
        expect(result).toBe("done");
        expect(clearTimeoutSpy).toHaveBeenCalled();
      } finally {
        clearTimeoutSpy.mockRestore();
      }
    });

    it("clears its timer when the promise rejects first", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      try {
        const failingPromise = Promise.reject(new Error("fast fail"));
        await expect(withTimeout(failingPromise, 10_000, () => new Error("timeout"))).rejects.toThrow("fast fail");
        expect(clearTimeoutSpy).toHaveBeenCalled();
      } finally {
        clearTimeoutSpy.mockRestore();
      }
    });

    it("aborts with onTimeout error when time elapses", async () => {
      const hanging = new Promise(() => {});
      await expect(withTimeout(hanging, 10, () => new Error("timed out!"))).rejects.toThrow("timed out!");
    });
  });

  it("persists DGII observations on submit when response includes messages (e.g. code 4 Aceptado Condicional)", async () => {
    const repository = createRepository(baseSnapshot());
    const signer: XmlSignerAdapter = { signXml: vi.fn(async () => ({ signedXml: "<Signed />" })) };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "accepted",
        trackId: "E310000000001",
        statusCode: "4",
        message: "Aceptado Condicional: [101] Advertencia",
        messages: [{ code: "101", text: "Advertencia" }],
      })),
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({ repository, custody, signer, dgii, workerId: "worker-a", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result.kind).toBe("processed");
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "accepted",
        dgiiStatusCode: "4",
        dgiiMessages: [{ code: "101", text: "Advertencia" }],
      })
    );
  });

  it("leaves dgii_messages untouched when submit code 1 does not return messages", async () => {
    const repository = createRepository(baseSnapshot());
    const signer: XmlSignerAdapter = { signXml: vi.fn(async () => ({ signedXml: "<Signed />" })) };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "accepted",
        trackId: "E310000000001",
        statusCode: "1",
        message: "Aceptado",
      })),
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({ repository, custody, signer, dgii, workerId: "worker-a", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result.kind).toBe("processed");
    const acceptedUpdate = repository.documentUpdates.find((u) => u.status === "accepted");
    expect(acceptedUpdate).toBeDefined();
    expect(acceptedUpdate).not.toHaveProperty("dgiiMessages");
  });

  it("preserves earlier observations when a later poll returns no messages", async () => {
    const snapshot = baseSnapshot({
      job: {
        id: "job-poll-1",
        tenantId: "tenant-1",
        ecfDocumentId: "doc-1",
        facturaId: "invoice-1",
        operation: "poll_status",
        status: "queued",
        attempts: 0,
        idempotencyKey: "tenant-1:TRK-1:poll",
      },
      document: {
        id: "doc-1",
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        status: "submitted",
        certificateMetadataId: "cert-1",
        dgiiTrackId: "TRK-1",
      },
    });
    const repository = createRepository(snapshot);
    const signer: XmlSignerAdapter = { signXml: vi.fn() };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(),
      pollStatus: vi.fn(async () => ({
        kind: "accepted",
        statusCode: "1",
        message: "Aceptado",
      })),
    };
    const worker = new FiscalWorker({ repository, custody, signer, dgii, workerId: "worker-a", now: () => now });

    const result = await worker.processJob("job-poll-1");

    expect(result.kind).toBe("processed");
    const pollAcceptedUpdate = repository.documentUpdates.find((u) => u.status === "accepted");
    expect(pollAcceptedUpdate).toBeDefined();
    expect(pollAcceptedUpdate).not.toHaveProperty("dgiiMessages");
  });

  it("resolves the current-environment cert when document is pinned to a cert of another environment and persists it", async () => {
    const snapshot = baseSnapshot({
      document: {
        id: "doc-1",
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        status: "queued",
        certificateMetadataId: "cert-stale-certif",
        dgiiTrackId: null,
      },
      certificate: {
        id: "cert-prod-1",
        tenantId: "tenant-1",
        environment: "production",
        isReady: true,
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    });
    const repository = createRepository(snapshot);
    const mockCustody: CertificateCustody = {
      getSigningMaterial: vi.fn(async ({ certificateId, environment }) => ({
        ok: true,
        value: {
          certificateId,
          tenantId: "tenant-1",
          environment,
          p12Bytes: new Uint8Array([1, 2, 3]),
          passphrase: "secret",
        } satisfies SigningMaterial,
      })),
    };
    const signer: XmlSignerAdapter = {
      signXml: vi.fn(async ({ unsignedXml }) => ({ signedXml: `<Signed>${unsignedXml}</Signed>` })),
    };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({ kind: "submitted", trackId: "TRK-PROD-1", statusCode: "REC" }) as const),
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer,
      dgii,
      workerId: "worker-prod",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "processed", jobId: "job-1", operation: "submit", status: "submitted" });
    expect(mockCustody.getSigningMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: "cert-prod-1", environment: "production" })
    );
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "signed",
        certificateMetadataId: "cert-prod-1",
      })
    );
  });

  it("uses the exact pinned certificate when it belongs to the current environment and is ready", async () => {
    const snapshot = baseSnapshot({
      document: {
        id: "doc-1",
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        status: "queued",
        certificateMetadataId: "cert-prod-pinned",
        dgiiTrackId: null,
      },
      certificate: {
        id: "cert-prod-pinned",
        tenantId: "tenant-1",
        environment: "production",
        isReady: true,
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    });
    const repository = createRepository(snapshot);
    const mockCustody: CertificateCustody = {
      getSigningMaterial: vi.fn(async ({ certificateId, environment }) => ({
        ok: true,
        value: {
          certificateId,
          tenantId: "tenant-1",
          environment,
          p12Bytes: new Uint8Array([1, 2, 3]),
          passphrase: "secret",
        } satisfies SigningMaterial,
      })),
    };
    const signer: XmlSignerAdapter = {
      signXml: vi.fn(async ({ unsignedXml }) => ({ signedXml: `<Signed>${unsignedXml}</Signed>` })),
    };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({ kind: "submitted", trackId: "TRK-PROD-2", statusCode: "REC" }) as const),
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer,
      dgii,
      workerId: "worker-prod",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "processed", jobId: "job-1", operation: "submit", status: "submitted" });
    expect(mockCustody.getSigningMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: "cert-prod-pinned", environment: "production" })
    );
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "signed",
        certificateMetadataId: "cert-prod-pinned",
      })
    );
  });

  it("fails with CERTIFICATE_NOT_READY when no ready certificate is present in the current environment", async () => {
    const snapshot = baseSnapshot({
      document: {
        id: "doc-1",
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        status: "queued",
        certificateMetadataId: "cert-stale-certif",
        dgiiTrackId: null,
      },
      certificate: null,
    });
    const repository = createRepository(snapshot);
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn() },
      dgii: { submitSignedXml: vi.fn(), pollStatus: vi.fn() },
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({
      kind: "failed",
      jobId: "job-1",
      retryable: false,
      code: "CERTIFICATE_NOT_READY",
    });
    expect(repository.jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "terminal_error",
        errorMessage: expect.stringContaining("Fiscal document has no ready certificate metadata."),
      })
    );
  });

  it("fails with TENANT_MISMATCH if the resolved certificate belongs to a different tenant", async () => {
    const snapshot = baseSnapshot({
      certificate: {
        id: "cert-tenant-2",
        tenantId: "tenant-intruder",
        environment: "production",
        isReady: true,
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    });
    const repository = createRepository(snapshot);
    const worker = new FiscalWorker({
      repository,
      custody,
      signer: { signXml: vi.fn() },
      dgii: { submitSignedXml: vi.fn(), pollStatus: vi.fn() },
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({
      kind: "failed",
      jobId: "job-1",
      retryable: false,
      code: "TENANT_MISMATCH",
    });
  });

  it("fails pollStatus with CERTIFICATE_ENVIRONMENT_CHANGED when document certificateMetadataId differs from resolved cert", async () => {
    const snapshot = baseSnapshot({
      job: {
        id: "job-poll-stale",
        tenantId: "tenant-1",
        ecfDocumentId: "doc-1",
        facturaId: "invoice-1",
        operation: "poll_status",
        status: "queued",
        attempts: 0,
        idempotencyKey: "tenant-1:TRK-1:poll",
      },
      document: {
        id: "doc-1",
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        status: "submitted",
        certificateMetadataId: "cert-old-certif",
        dgiiTrackId: "TRK-1",
      },
      certificate: {
        id: "cert-new-prod",
        tenantId: "tenant-1",
        environment: "production",
        isReady: true,
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    });
    const repository = createRepository(snapshot);
    const mockCustody: CertificateCustody = {
      getSigningMaterial: vi.fn(),
    };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(),
      pollStatus: vi.fn(),
    };
    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: { signXml: vi.fn() },
      dgii,
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-poll-stale");

    expect(result).toEqual({
      kind: "failed",
      jobId: "job-poll-stale",
      retryable: false,
      code: "CERTIFICATE_ENVIRONMENT_CHANGED",
    });
    expect(repository.updateDocument).not.toHaveBeenCalled();
    expect(repository.documentUpdates).toEqual([]);
    expect(dgii.pollStatus).not.toHaveBeenCalled();
    expect(repository.jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "terminal_error",
        errorMessage: expect.stringContaining("Document was submitted under a different e-CF environment than the tenant's current one; it cannot be polled."),
      })
    );
  });

  it("adopts resolved cert and polls during pollStatus when document certificateMetadataId is null", async () => {
    const snapshot = baseSnapshot({
      job: {
        id: "job-poll-null-cert",
        tenantId: "tenant-1",
        ecfDocumentId: "doc-1",
        facturaId: "invoice-1",
        operation: "poll_status",
        status: "queued",
        attempts: 0,
        idempotencyKey: "tenant-1:TRK-1:poll",
      },
      document: {
        id: "doc-1",
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        status: "submitted",
        certificateMetadataId: null,
        dgiiTrackId: "TRK-1",
      },
      certificate: {
        id: "cert-new-prod",
        tenantId: "tenant-1",
        environment: "production",
        isReady: true,
        validUntil: "2027-01-01T00:00:00.000Z",
      },
    });
    const repository = createRepository(snapshot);
    const mockCustody: CertificateCustody = {
      getSigningMaterial: vi.fn(async ({ certificateId, environment }) => ({
        ok: true,
        value: {
          certificateId,
          tenantId: "tenant-1",
          environment,
          p12Bytes: new Uint8Array([1, 2, 3]),
          passphrase: "secret",
        } satisfies SigningMaterial,
      })),
    };
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(),
      pollStatus: vi.fn(async () => ({ kind: "accepted", statusCode: "ACE", message: "Accepted" }) as const),
    };
    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: { signXml: vi.fn() },
      dgii,
      workerId: "worker-a",
      now: () => now,
    });

    const result = await worker.processJob("job-poll-null-cert");

    expect(result.kind).toBe("processed");
    expect(repository.updateDocument).toHaveBeenCalledWith("doc-1", {
      certificateMetadataId: "cert-new-prod",
    });
    expect(repository.documentUpdates).toContainEqual({
      certificateMetadataId: "cert-new-prod",
    });
    expect(mockCustody.getSigningMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: "cert-new-prod", environment: "production" })
    );
    expect(dgii.pollStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: "TRK-1",
        environment: "production",
      })
    );
  });
});
