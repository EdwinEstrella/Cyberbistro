import { describe, expect, it, vi } from "vitest";
import { FiscalWorker } from "../worker/fiscal/fiscalWorker";
import { isRfceDocument } from "../worker/fiscal/dgiiAdapters";
import type {
  CertificateCustody,
  DgiiClientAdapter,
  FiscalAuditEvent,
  FiscalWorkerRepository,
  FiscalWorkerSnapshot,
  SigningMaterial,
  XmlSignerAdapter,
  DgiiSubmitResult,
} from "../worker/fiscal/types";

const now = new Date("2026-11-06T10:00:00.000Z");

function createMockRepository(snapshot: FiscalWorkerSnapshot): FiscalWorkerRepository & {
  auditEvents: FiscalAuditEvent[];
  documentUpdates: Array<Record<string, unknown>>;
  jobUpdates: Array<Record<string, unknown>>;
  enqueuedJobs: Array<Record<string, unknown>>;
} {
  const auditEvents: FiscalAuditEvent[] = [];
  const documentUpdates: Array<Record<string, unknown>> = [];
  const jobUpdates: Array<Record<string, unknown>> = [];
  const enqueuedJobs: Array<Record<string, unknown>> = [];

  return {
    auditEvents,
    documentUpdates,
    jobUpdates,
    enqueuedJobs,
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
    enqueueJob: vi.fn(async (job) => {
      enqueuedJobs.push(job);
    }),
  };
}

const mockCustody: CertificateCustody = {
  getSigningMaterial: vi.fn(async () => ({
    ok: true,
    value: {
      certificateId: "cert-1",
      tenantId: "tenant-1",
      environment: "production",
      p12Bytes: new Uint8Array([1, 2, 3]),
      passphrase: "secret",
    } satisfies SigningMaterial,
  }) as const),
};

const mockSigner: XmlSignerAdapter = {
  signXml: vi.fn(async ({ unsignedXml }) => ({ signedXml: `<Signed>${unsignedXml}</Signed>` })),
};

function buildRfceSnapshot(overrides: Partial<FiscalWorkerSnapshot> = {}): FiscalWorkerSnapshot {
  return {
    ecf_secuencias_rangos: { E32: { start: 1, end: 500, vence: "31-12-2027" } },
    job: {
      id: "job-rfce-1",
      tenantId: "tenant-1",
      ecfDocumentId: "doc-rfce-1",
      facturaId: "invoice-rfce-1",
      operation: "submit",
      status: "queued",
      attempts: 0,
      idempotencyKey: "tenant-1:invoice-rfce-1:submit",
    },
    document: {
      id: "doc-rfce-1",
      tenantId: "tenant-1",
      facturaId: "invoice-rfce-1",
      status: "queued",
      certificateMetadataId: "cert-1",
      dgiiTrackId: null,
      dgiiSecurityCode: "ABC123",
      rfce_threshold_used: 250000,
      rejection_scope: "individual",
    },
    certificate: {
      id: "cert-1",
      tenantId: "tenant-1",
      environment: "production",
      isReady: true,
      validUntil: "2027-12-31T23:59:59.000Z",
    },
    invoicePayload: {
      factura: {
        total: 500,
        itbis: 90,
        subtotal: 410,
        created_at: "2026-11-06T10:00:00.000Z",
        cliente_rnc: "123456789",
        ncf: "E320000000001",
        tipoe_cf: 32,
      },
      tenant: {
        rnc: "131880738",
        nombre_negocio: "TEST RESTAURANT SRL",
        direccion: "Av. Winston Churchill",
        telefono: "8095555555",
        email: "info@test.com",
        ecf_issuer_sucursal: "Principal",
        ecf_issuer_municipio: "Santo Domingo Centro",
        ecf_issuer_provincia: "Distrito Nacional",
        ecf_issuer_actividad_economica: "6201",
        ecf_issuer_correo_emisor: "factura@test.com",
        ecf_environment: "production",
        ecf_secuencias_rangos: { E32: { start: 1, end: 500, vence: "31-12-2027" } },
      },
      items: [],
      payments: [],
    },
    ...overrides,
  };
}

describe("RFCE Submit and Poll Result Handling", () => {
  it("RFCE submit with codigo 1/4 results in accepted document with no poll job enqueued", async () => {
    const snapshot = buildRfceSnapshot();
    const repository = createMockRepository(snapshot);
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "accepted",
        trackId: "E320000000001",
        statusCode: "1",
        message: "Aceptado",
        rfceThresholdUsed: 250000,
      } as DgiiSubmitResult)),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };

    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: mockSigner,
      dgii,
      workerId: "worker-test",
      now: () => now,
    });

    const result = await worker.processJob("job-rfce-1");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-rfce-1",
      operation: "submit",
      status: "accepted",
    });

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "accepted",
        dgiiTrackId: "E320000000001",
        dgiiStatusCode: "1",
        dgiiStatusMessage: "Aceptado",
        acceptedAt: now.toISOString(),
        submittedAt: now.toISOString(),
      })
    );

    // CRITICAL: No poll job enqueued!
    expect(repository.enqueuedJobs).toEqual([]);
  });

  it("RFCE submit with codigo 2 results in terminal rejected document with no poll job enqueued", async () => {
    const snapshot = buildRfceSnapshot();
    const repository = createMockRepository(snapshot);
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "rejected",
        trackId: "E320000000001",
        statusCode: "2",
        message: "DGII [2] Rechazado: [31] RNC Invalido",
        rfceThresholdUsed: 250000,
      } as DgiiSubmitResult)),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };

    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: mockSigner,
      dgii,
      workerId: "worker-test",
      now: () => now,
    });

    const result = await worker.processJob("job-rfce-1");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-rfce-1",
      operation: "submit",
      status: "rejected",
    });

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "rejected",
        dgiiStatusCode: "2",
        dgiiStatusMessage: "DGII [2] Rechazado: [31] RNC Invalido",
        rejectedAt: now.toISOString(),
        lastError: "DGII [2] Rechazado: [31] RNC Invalido",
      })
    );

    expect(repository.enqueuedJobs).toEqual([]);
  });

  it("RFCE submit with codigo 3 results in submitted document and enqueues poll job", async () => {
    const snapshot = buildRfceSnapshot();
    const repository = createMockRepository(snapshot);
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "submitted",
        trackId: "E320000000001",
        statusCode: "3",
        message: "En proceso",
        rfceThresholdUsed: 250000,
      } as DgiiSubmitResult)),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };

    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: mockSigner,
      dgii,
      workerId: "worker-test",
      now: () => now,
    });

    const result = await worker.processJob("job-rfce-1");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-rfce-1",
      operation: "submit",
      status: "submitted",
    });

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "submitted",
        dgiiTrackId: "E320000000001",
        dgiiStatusCode: "3",
        dgiiStatusMessage: "En proceso",
      })
    );

    expect(repository.enqueuedJobs).toEqual([
      expect.objectContaining({
        operation: "poll_status",
        ecfDocumentId: "doc-rfce-1",
        idempotencyKey: "tenant-1:E320000000001:poll",
      }),
    ]);
  });

  it("polling an RFCE document passes isRfce, rncEmisor, encf, and securityCode to dgii.pollStatus", async () => {
    const base = buildRfceSnapshot();
    const pollSnapshot: FiscalWorkerSnapshot = {
      ...base,
      job: {
        ...base.job,
        id: "job-poll-1",
        operation: "poll_status",
        idempotencyKey: "tenant-1:E320000000001:poll",
      },
      document: {
        ...base.document,
        status: "submitted",
        dgiiTrackId: "E320000000001",
        dgiiSecurityCode: "SEC999",
        rfce_threshold_used: 250000,
      },
    };

    const repository = createMockRepository(pollSnapshot);
    const pollStatusMock = vi.fn().mockResolvedValue({
      kind: "accepted",
      statusCode: "1",
      message: "Aceptado",
    });

    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: mockSigner,
      dgii: {
        submitSignedXml: vi.fn(),
        pollStatus: pollStatusMock,
        sendSummary: vi.fn(),
      },
      workerId: "worker-test",
      now: () => now,
    });

    const result = await worker.processJob("job-poll-1");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-poll-1",
      operation: "poll_status",
      status: "accepted",
    });

    expect(pollStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isRfce: true,
        rncEmisor: "131880738",
        encf: "E320000000001",
        securityCode: "SEC999",
      })
    );

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "accepted",
        dgiiStatusCode: "1",
        dgiiStatusMessage: "Aceptado",
        acceptedAt: now.toISOString(),
      })
    );
  });

  it("full e-CF submission and polling remain unchanged", async () => {
    const fullSnapshot: FiscalWorkerSnapshot = {
      ecf_secuencias_rangos: { E31: { start: 1, end: 100, vence: "31-12-2027" } },
      job: {
        id: "job-full-1",
        tenantId: "tenant-1",
        ecfDocumentId: "doc-full-1",
        facturaId: "inv-full-1",
        operation: "submit",
        status: "queued",
        attempts: 0,
        idempotencyKey: "tenant-1:inv-full-1:submit",
      },
      document: {
        id: "doc-full-1",
        tenantId: "tenant-1",
        facturaId: "inv-full-1",
        status: "queued",
        certificateMetadataId: "cert-1",
        dgiiTrackId: null,
        rfce_threshold_used: null,
        rejection_scope: "individual",
      },
      certificate: {
        id: "cert-1",
        tenantId: "tenant-1",
        environment: "production",
        isReady: true,
        validUntil: "2027-12-31T23:59:59.000Z",
      },
      invoicePayload: {
        factura: {
          total: 118,
          itbis: 18,
          subtotal: 100,
          created_at: "2026-11-06T10:00:00.000Z",
          cliente_rnc: "123456789",
          cliente_nombre: "Test Client",
          ncf: "E310000000001",
          tipoe_cf: 31,
        },
        tenant: {
          rnc: "131880738",
          nombre_negocio: "TEST RESTAURANT SRL",
          direccion: "Av. Winston Churchill",
          telefono: "8095555555",
          email: "info@test.com",
          ecf_issuer_sucursal: "Principal",
          ecf_issuer_municipio: "Santo Domingo Centro",
          ecf_issuer_provincia: "Distrito Nacional",
          ecf_issuer_actividad_economica: "6201",
          ecf_issuer_correo_emisor: "factura@test.com",
          ecf_environment: "production",
          ecf_secuencias_rangos: { E31: { start: 1, end: 100, vence: "31-12-2027" } },
        },
        items: [],
        payments: [],
      },
    };

    const repository = createMockRepository(fullSnapshot);
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "submitted",
        trackId: "TRK-FULL-12345",
        statusCode: "200",
        message: "Sent to DGII",
        rfceThresholdUsed: null,
      })),
      pollStatus: vi.fn(async () => ({
        kind: "accepted",
        statusCode: "1",
        message: "Aceptado",
      })),
      sendSummary: vi.fn(),
    };

    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: mockSigner,
      dgii,
      workerId: "worker-test",
      now: () => now,
    });

    const submitResult = await worker.processJob("job-full-1");
    expect(submitResult).toEqual({
      kind: "processed",
      jobId: "job-full-1",
      operation: "submit",
      status: "submitted",
    });

    expect(repository.enqueuedJobs).toEqual([
      expect.objectContaining({
        operation: "poll_status",
        idempotencyKey: "tenant-1:TRK-FULL-12345:poll",
      }),
    ]);
  });

  it("persistPollResult must NEVER downgrade a document already 'accepted' or 'rejected'", async () => {
    const base = buildRfceSnapshot();
    const acceptedSnapshot: FiscalWorkerSnapshot = {
      ...base,
      job: {
        ...base.job,
        id: "job-poll-already-accepted",
        operation: "poll_status",
        idempotencyKey: "tenant-1:E320000000001:poll",
      },
      document: {
        ...base.document,
        status: "accepted", // Document is ALREADY accepted!
        dgiiTrackId: "E320000000001",
      },
    };

    const repository = createMockRepository(acceptedSnapshot);
    // DGII returns "No encontrado" or error (as happened in production)
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(),
      pollStatus: vi.fn(async () => ({
        kind: "terminal_error",
        statusCode: "5000002",
        message: "No encontrado",
      })),
      sendSummary: vi.fn(),
    };

    const worker = new FiscalWorker({
      repository,
      custody: mockCustody,
      signer: mockSigner,
      dgii,
      workerId: "worker-test",
      now: () => now,
    });

    const result = await worker.processJob("job-poll-already-accepted");

    // Must finish successfully without overwriting the document
    expect(result).toEqual({
      kind: "processed",
      jobId: "job-poll-already-accepted",
      operation: "poll_status",
      status: "accepted",
    });

    // Document update MUST NOT be called!
    expect(repository.documentUpdates).toEqual([]);

    // Must record an audit event explaining downgrade was prevented
    expect(repository.auditEvents).toContainEqual(
      expect.objectContaining({
        eventType: "job_skipped",
        metadata: expect.objectContaining({
          reason: expect.stringMatching(/preserved|downgrade/i),
          currentStatus: "accepted",
        }),
      })
    );
  });

  describe("isRfceDocument and polling routing", () => {
    it("E32 total 300000 with rfceThresholdUsed 250000 -> NOT rfce (polls statusTrackId)", async () => {
      expect(
        isRfceDocument({
          tipoeCF: 32,
          ncf: "E320000000001",
          total: 300000,
          rfceThresholdUsed: 250000,
        })
      ).toBe(false);

      const base = buildRfceSnapshot();
      const pollSnapshot: FiscalWorkerSnapshot = {
        ...base,
        job: {
          ...base.job,
          id: "job-poll-large-e32",
          operation: "poll_status",
          idempotencyKey: "tenant-1:track-uuid-large:poll",
        },
        document: {
          ...base.document,
          status: "submitted",
          dgiiTrackId: "track-uuid-large",
          dgiiSecurityCode: "SEC123",
          rfce_threshold_used: 250000,
        },
        invoicePayload: {
          ...base.invoicePayload,
          factura: {
            ...((base.invoicePayload?.factura as any) ?? {}),
            ncf: "E320000000001",
            tipoe_cf: 32,
            total: 300000,
          },
        },
      };

      const repository = createMockRepository(pollSnapshot);
      const pollStatusMock = vi.fn().mockResolvedValue({
        kind: "accepted",
        statusCode: "1",
        message: "Aceptado",
      });

      const worker = new FiscalWorker({
        repository,
        custody: mockCustody,
        signer: mockSigner,
        dgii: {
          submitSignedXml: vi.fn(),
          pollStatus: pollStatusMock,
          sendSummary: vi.fn(),
        },
        workerId: "worker-test",
        now: () => now,
      });

      await worker.processJob("job-poll-large-e32");

      expect(pollStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isRfce: false,
          trackId: "track-uuid-large",
        })
      );
    });

    it("E32 100 -> rfce (summary inquiry)", async () => {
      expect(
        isRfceDocument({
          tipoeCF: 32,
          ncf: "E320000000001",
          total: 100,
          rfceThresholdUsed: 250000,
        })
      ).toBe(true);

      const base = buildRfceSnapshot();
      const pollSnapshot: FiscalWorkerSnapshot = {
        ...base,
        job: {
          ...base.job,
          id: "job-poll-small-e32",
          operation: "poll_status",
          idempotencyKey: "tenant-1:E320000000001:poll",
        },
        document: {
          ...base.document,
          status: "submitted",
          dgiiTrackId: "E320000000001",
          dgiiSecurityCode: "SEC123",
          rfce_threshold_used: 250000,
        },
        invoicePayload: {
          ...base.invoicePayload,
          factura: {
            ...((base.invoicePayload?.factura as any) ?? {}),
            ncf: "E320000000001",
            tipoe_cf: 32,
            total: 100,
          },
        },
      };

      const repository = createMockRepository(pollSnapshot);
      const pollStatusMock = vi.fn().mockResolvedValue({
        kind: "accepted",
        statusCode: "1",
        message: "Aceptado",
      });

      const worker = new FiscalWorker({
        repository,
        custody: mockCustody,
        signer: mockSigner,
        dgii: {
          submitSignedXml: vi.fn(),
          pollStatus: pollStatusMock,
          sendSummary: vi.fn(),
        },
        workerId: "worker-test",
        now: () => now,
      });

      await worker.processJob("job-poll-small-e32");

      expect(pollStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isRfce: true,
          encf: "E320000000001",
          securityCode: "SEC123",
        })
      );
    });

    it("E31 -> not rfce", async () => {
      expect(
        isRfceDocument({
          tipoeCF: 31,
          ncf: "E310000000001",
          total: 100,
          rfceThresholdUsed: 250000,
        })
      ).toBe(false);

      expect(
        isRfceDocument({
          ncf: "E310000000001",
          total: 100,
        })
      ).toBe(false);

      const base = buildRfceSnapshot();
      const pollSnapshot: FiscalWorkerSnapshot = {
        ...base,
        job: {
          ...base.job,
          id: "job-poll-e31",
          operation: "poll_status",
          idempotencyKey: "tenant-1:track-uuid-e31:poll",
        },
        document: {
          ...base.document,
          status: "submitted",
          dgiiTrackId: "track-uuid-e31",
          dgiiSecurityCode: "SEC123",
          rfce_threshold_used: null,
        },
        invoicePayload: {
          ...base.invoicePayload,
          factura: {
            ...((base.invoicePayload?.factura as any) ?? {}),
            ncf: "E310000000001",
            tipoe_cf: 31,
            total: 100,
          },
        },
      };

      const repository = createMockRepository(pollSnapshot);
      const pollStatusMock = vi.fn().mockResolvedValue({
        kind: "accepted",
        statusCode: "1",
        message: "Aceptado",
      });

      const worker = new FiscalWorker({
        repository,
        custody: mockCustody,
        signer: mockSigner,
        dgii: {
          submitSignedXml: vi.fn(),
          pollStatus: pollStatusMock,
          sendSummary: vi.fn(),
        },
        workerId: "worker-test",
        now: () => now,
      });

      await worker.processJob("job-poll-e31");

      expect(pollStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isRfce: false,
          trackId: "track-uuid-e31",
        })
      );
    });
  });
});
