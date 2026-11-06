/**
 * TDD: RFCE synchronous submit result mapping.
 *
 * DGII PROD bug (2026-11-06): E32 documents below the RFCE threshold were routed through
 * sendSummary, which returns a synchronous acceptance response (codigo 1/4). The adapter
 * incorrectly mapped this to kind='submitted' with trackId=response.encf, causing the
 * worker to enqueue a poll_status job that called statusTrackId on an eNCF — a method that
 * does not apply to RFCE summaries — leaving the document stuck in 'submitted' forever.
 *
 * Fix contract (all four RFCE status codes must be explicitly handled):
 *   codigo 1 → accepted  (no poll job)
 *   codigo 4 → accepted  (with message/mensajes detail, no poll job)
 *   codigo 2 → rejected  (terminal, message via describeDgiiError, no poll job)
 *   codigo 3 → submitted (keep polling; uses eNCF as trackId since RFCE status query
 *                          getSummaryInvoiceInquiry is production-only and cannot be used
 *                          reliably in all environments — trackId stays eNCF for future use)
 *
 * Full e-CF path (sendElectronicDocument with trackId) is unchanged: submitted + poll.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { RealDgiiClient } from "../worker/fiscal/dgiiAdapters";
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

// ---------------------------------------------------------------------------
// dgii-ecf mock (shared with fiscal-real-dgii-client.test.ts pattern)
// ---------------------------------------------------------------------------

const mockAuthenticate = vi.fn();
const mockSendElectronicDocument = vi.fn();
const mockSendSummary = vi.fn();
const mockStatusTrackId = vi.fn();
const mockSignXml = vi.fn().mockImplementation((xml: string, type?: string) =>
  `<Signed_${type ?? "ECF"}>${xml}</Signed_${type ?? "ECF"}>`
);
const mockGetKeyFromStringBase64 = vi.fn().mockReturnValue({ key: "mock-key", cert: "mock-cert" });

vi.mock("dgii-ecf", async (importOriginal) => {
  // Keep the real Transformer so createUnsignedEcfXml can generate valid XML
  const actual = await importOriginal<typeof import("dgii-ecf")>();

  const ecfConstructor = vi.fn().mockImplementation(() => ({
    authenticate: mockAuthenticate,
    sendElectronicDocument: mockSendElectronicDocument,
    sendSummary: mockSendSummary,
    statusTrackId: mockStatusTrackId,
  }));

  return {
    ...actual,
    default: ecfConstructor,
    ECF: ecfConstructor,
    P12Reader: vi.fn().mockImplementation(() => ({
      getKeyFromStringBase64: mockGetKeyFromStringBase64,
    })),
    Signature: vi.fn().mockImplementation(() => ({
      signXml: mockSignXml,
    })),
    convertECF32ToRFCE: vi.fn().mockImplementation((xml: string) => ({
      xml: `<RFCE>${xml}</RFCE>`,
      securityCode: "123456",
    })),
    getCodeSixDigitfromSignature: vi.fn().mockReturnValue("123456"),
  };
});

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const mockCertificate = {
  tenantId: "tenant-1",
  certificateId: "cert-1",
  environment: "certification" as const,
  p12Bytes: new Uint8Array([1, 2, 3]),
  passphrase: "password123",
};

const E32_BELOW_THRESHOLD_XML =
  "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000001</eNCF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ECF_E32_RFCE_THRESHOLD_DOP;
  mockAuthenticate.mockResolvedValue({ token: "tok" });
});

// ---------------------------------------------------------------------------
// Section 1: RealDgiiClient — RFCE branch response mapping
// ---------------------------------------------------------------------------

describe("RealDgiiClient — RFCE synchronous response mapping", () => {
  it("maps codigo 1 (Aceptado) to kind='accepted' with rfceThresholdUsed and NO trackId", async () => {
    mockSendSummary.mockResolvedValue({
      codigo: 1,
      estado: "Aceptado",
      encf: "E3200000001",
      secuenciaUtilizada: true,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: E32_BELOW_THRESHOLD_XML,
      environment: "certification",
      idempotencyKey: "ikey-1",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("accepted");
    // accepted results must NOT carry a trackId (eNCF is not a poll trackId for RFCE)
    expect((result as any).trackId).toBeUndefined();
    expect(result).toMatchObject({
      kind: "accepted",
      statusCode: "1",
      message: expect.stringContaining("Aceptado"),
      rfceThresholdUsed: 250000,
    });
  });

  it("maps codigo 4 (Aceptado Condicional) to kind='accepted' with mensajes detail in message", async () => {
    mockSendSummary.mockResolvedValue({
      codigo: 4,
      estado: "Aceptado Condicional",
      encf: "E3200000002",
      secuenciaUtilizada: true,
      mensajes: [{ codigo: 99, valor: "El campo X requiere revisión" }],
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: E32_BELOW_THRESHOLD_XML,
      environment: "certification",
      idempotencyKey: "ikey-4",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("accepted");
    expect((result as any).trackId).toBeUndefined();
    // message must include the conditional estado and the mensajes detail
    expect(result.message).toContain("Aceptado Condicional");
    expect(result.message).toContain("El campo X requiere revisión");
    expect(result).toMatchObject({
      kind: "accepted",
      statusCode: "4",
      rfceThresholdUsed: 250000,
    });
  });

  it("maps codigo 2 (Rechazado) to kind='rejected' terminal with describeDgiiError message", async () => {
    mockSendSummary.mockResolvedValue({
      codigo: 2,
      estado: "Rechazado",
      encf: "E3200000003",
      secuenciaUtilizada: false,
      mensajes: [{ codigo: 44, valor: "RNC Emisor no válido" }],
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: E32_BELOW_THRESHOLD_XML,
      environment: "certification",
      idempotencyKey: "ikey-2",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("rejected");
    expect((result as any).trackId).toBeUndefined();
    expect(result.message).toContain("RNC Emisor no válido");
    expect(result).toMatchObject({
      kind: "rejected",
      statusCode: "2",
    });
  });

  it("maps codigo 3 (En proceso) to kind='submitted' with eNCF as trackId for future polling", async () => {
    mockSendSummary.mockResolvedValue({
      codigo: 3,
      estado: "En proceso",
      encf: "E3200000004",
      secuenciaUtilizada: false,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: E32_BELOW_THRESHOLD_XML,
      environment: "certification",
      idempotencyKey: "ikey-3",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("submitted");
    // For codigo 3 we still need a trackId to poll (best-effort: eNCF)
    expect((result as any).trackId).toBe("E3200000004");
    expect(result).toMatchObject({
      kind: "submitted",
      statusCode: "3",
      rfceThresholdUsed: 250000,
    });
  });

  it("maps an unknown RFCE codigo to terminal_error", async () => {
    mockSendSummary.mockResolvedValue({
      codigo: 99,
      estado: "Estado desconocido",
      encf: "E3200000005",
      secuenciaUtilizada: false,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: E32_BELOW_THRESHOLD_XML,
      environment: "certification",
      idempotencyKey: "ikey-99",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("terminal_error");
  });

  it("full e-CF path (sendElectronicDocument) still returns kind='submitted' with trackId", async () => {
    mockSendElectronicDocument.mockResolvedValue({ trackId: "TRACK-ECF-1" });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml:
        "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3100000001</eNCF><TipoeCF>31</TipoeCF><MontoTotal>99999</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "ikey-ecf",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("submitted");
    expect((result as any).trackId).toBe("TRACK-ECF-1");
    expect(mockSendSummary).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Section 2: FiscalWorker.persistSubmissionResult — accepted/rejected handling
// ---------------------------------------------------------------------------

const now = new Date("2026-11-06T09:00:00.000Z");

function baseSnapshot(overrides: Partial<FiscalWorkerSnapshot> = {}): FiscalWorkerSnapshot {
  return {
    ecf_secuencias_rangos: { E32: { start: 1, end: 300, vence: "31-12-2027" } },
    job: {
      id: "job-rfce",
      tenantId: "tenant-1",
      ecfDocumentId: "doc-rfce",
      facturaId: "inv-rfce",
      operation: "submit",
      status: "queued",
      attempts: 0,
      idempotencyKey: "tenant-1:inv-rfce:submit",
    },
    document: {
      id: "doc-rfce",
      tenantId: "tenant-1",
      facturaId: "inv-rfce",
      status: "queued",
      certificateMetadataId: "cert-1",
      dgiiTrackId: null,
      rfce_threshold_used: null,
      rejection_scope: null,
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
        total: 150000,
        itbis: 0,
        subtotal: 150000,
        created_at: "2026-11-06T09:00:00.000Z",
        cliente_rnc: null,
        cliente_nombre: "Consumidor Final",
        ncf: "E320000000001",
      },
      tenant: {
        rnc: "131880738",
        nombre_negocio: "CYBERBISTRO SRL",
        direccion: "Av. Winston Churchill",
        telefono: "8095555555",
        email: "info@cyberbistro.app",
        ecf_issuer_sucursal: "Principal",
        ecf_issuer_municipio: "Santo Domingo Centro",
        ecf_issuer_provincia: "Distrito Nacional",
        ecf_issuer_actividad_economica: "6201",
        ecf_issuer_correo_emisor: "factura@cyberbistro.app",
        ecf_secuencias_rangos: { E32: { start: 1, end: 300, vence: "31-12-2027" } },
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
    recordAudit: vi.fn(async (event) => { auditEvents.push(event); }),
    updateDocument: vi.fn(async (_documentId, update) => { documentUpdates.push(update); }),
    updateJob: vi.fn(async (_jobId, update) => { jobUpdates.push(update); }),
    enqueueJob: vi.fn(async (job) => { enqueuedJobs.push(job as Record<string, unknown>); }),
  };
}

const custody: CertificateCustody = {
  getSigningMaterial: vi.fn(async () => ({
    ok: true as const,
    value: {
      certificateId: "cert-1",
      tenantId: "tenant-1",
      environment: "certification",
      p12Bytes: new Uint8Array([1, 2, 3]),
      passphrase: "secret",
    } satisfies SigningMaterial,
  })),
};

const signer: XmlSignerAdapter = {
  signXml: vi.fn(async ({ unsignedXml }) => ({
    signedXml: `<Signed>${unsignedXml}</Signed>`,
  })),
};

function makeWorker(snapshot: FiscalWorkerSnapshot, dgii: DgiiClientAdapter) {
  const repository = createRepository(snapshot);
  const worker = new FiscalWorker({
    repository,
    custody,
    signer,
    dgii,
    workerId: "worker-test",
    now: () => now,
  });
  return { repository, worker };
}

describe("FiscalWorker — RFCE accepted result (codigo 1)", () => {
  it("sets document to 'accepted', records acceptedAt, submittedAt, dgiiTrackId=eNCF, and does NOT enqueue a poll_status job", async () => {
    const snapshot = baseSnapshot();
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "accepted" as const,
        statusCode: "1",
        message: "Aceptado",
        rfceThresholdUsed: 250000,
        dgiiTrackId: "E320000000001",
      })),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };
    const { repository, worker } = makeWorker(snapshot, dgii);

    const result = await worker.processJob("job-rfce");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-rfce",
      operation: "submit",
      status: "accepted",
    });

    // Document must be accepted immediately
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "accepted",
        acceptedAt: now.toISOString(),
        submittedAt: now.toISOString(),
        dgiiStatusCode: "1",
        dgiiStatusMessage: "Aceptado",
        lastError: null,
      })
    );

    // No poll_status job must be created
    expect(repository.enqueuedJobs).not.toContainEqual(
      expect.objectContaining({ operation: "poll_status" })
    );
  });
});

describe("FiscalWorker — RFCE accepted result (codigo 4, Aceptado Condicional)", () => {
  it("sets document to 'accepted' with conditional message and does NOT enqueue poll_status", async () => {
    const snapshot = baseSnapshot();
    const conditionalMessage = "Aceptado Condicional: [99] El campo X requiere revisión";
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "accepted" as const,
        statusCode: "4",
        message: conditionalMessage,
        rfceThresholdUsed: 250000,
        dgiiTrackId: "E320000000002",
      })),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };
    const { repository, worker } = makeWorker(snapshot, dgii);

    const result = await worker.processJob("job-rfce");

    expect(result.kind).toBe("processed");
    expect(result).toMatchObject({ status: "accepted" });

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "accepted",
        dgiiStatusCode: "4",
        dgiiStatusMessage: conditionalMessage,
        acceptedAt: now.toISOString(),
        lastError: null,
      })
    );
    expect(repository.enqueuedJobs).not.toContainEqual(
      expect.objectContaining({ operation: "poll_status" })
    );
  });
});

describe("FiscalWorker — RFCE rejected result (codigo 2)", () => {
  it("sets document to 'rejected' terminal, records rejectedAt, and does NOT enqueue poll_status", async () => {
    const snapshot = baseSnapshot();
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "rejected" as const,
        statusCode: "2",
        message: "Rechazado: [44] RNC Emisor no válido",
        rfceThresholdUsed: 250000,
      })),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };
    const { repository, worker } = makeWorker(snapshot, dgii);

    const result = await worker.processJob("job-rfce");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-rfce",
      operation: "submit",
      status: "rejected",
    });

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "rejected",
        rejectedAt: now.toISOString(),
        dgiiStatusCode: "2",
        lastError: expect.stringContaining("RNC Emisor no válido"),
      })
    );
    expect(repository.enqueuedJobs).not.toContainEqual(
      expect.objectContaining({ operation: "poll_status" })
    );
    // Job must complete, not fail — rejected is a valid terminal outcome from submit
    expect(repository.jobUpdates).toContainEqual(expect.objectContaining({ status: "done" }));
  });
});

describe("FiscalWorker — RFCE submitted result (codigo 3, En proceso)", () => {
  it("sets document to 'submitted' and enqueues a poll_status job", async () => {
    const snapshot = baseSnapshot();
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "submitted" as const,
        trackId: "E3200000004",
        statusCode: "3",
        message: "En proceso",
        rfceThresholdUsed: 250000,
      })),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };
    const { repository, worker } = makeWorker(snapshot, dgii);

    const result = await worker.processJob("job-rfce");

    expect(result).toEqual({
      kind: "processed",
      jobId: "job-rfce",
      operation: "submit",
      status: "submitted",
    });

    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "submitted",
        dgiiTrackId: "E3200000004",
        statusCode: undefined, // only dgiiStatusCode is on the document
      }).not
    );
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "submitted",
        dgiiTrackId: "E3200000004",
      })
    );
    expect(repository.enqueuedJobs).toContainEqual(
      expect.objectContaining({ operation: "poll_status" })
    );
  });
});

describe("FiscalWorker — full e-CF path (sendElectronicDocument) is unchanged", () => {
  it("still returns submitted + poll_status job for a standard trackId-based submit", async () => {
    const snapshot = baseSnapshot({
      document: { ...baseSnapshot().document, rfce_threshold_used: null },
    });
    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "submitted" as const,
        trackId: "TRACK-ECF-FULL",
        statusCode: "200",
        message: "Sent to DGII",
        rfceThresholdUsed: null,
      })),
      pollStatus: vi.fn(),
      sendSummary: vi.fn(),
    };
    const { repository, worker } = makeWorker(snapshot, dgii);

    const result = await worker.processJob("job-rfce");

    expect(result).toMatchObject({ kind: "processed", status: "submitted" });
    expect(repository.documentUpdates).toContainEqual(
      expect.objectContaining({ status: "submitted", dgiiTrackId: "TRACK-ECF-FULL" })
    );
    expect(repository.enqueuedJobs).toContainEqual(
      expect.objectContaining({ operation: "poll_status" })
    );
  });
});
