import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveActiveFiscalMode, runFiscalEngine } from "../src/shared/lib/fiscalEngine";
import { enqueueLocalWrite } from "../src/shared/lib/localFirst";
import { FiscalWorker } from "../worker/fiscal/fiscalWorker";
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

class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
}
vi.stubGlobal("localStorage", new LocalStorageMock());

// Mock localFirst
vi.mock("../src/shared/lib/localFirst", () => ({
  resolveNcfForNewInvoiceLocalFirst: vi.fn(),
  enqueueLocalWrite: vi.fn(),
}));

// Mock insforgeClient
vi.mock("../src/shared/lib/insforge", () => {
  const queryChain = {
    select: vi.fn(() => queryChain),
    eq: vi.fn(() => queryChain),
    maybeSingle: vi.fn(() => ({ data: null, error: null })),
  };
  return {
    insforgeClient: {
      database: {
        from: vi.fn(() => queryChain),
      },
    },
  };
});

describe("Offline e-CF Sales and Reconnect Sync Integration", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  let localWrites: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localWrites = [];

    // Capture local writes
    vi.mocked(enqueueLocalWrite).mockImplementation(async (write) => {
      localWrites.push(write);
      return { success: true } as any;
    });
  });

  it("simulates full lifecycle: offline e-CF generation, local queueing, reconnect sync, and idempotent worker processing", async () => {
    // 1. OFFLINE SALE INITIATION
    const settings = {
      fiscalMode: "dgii_ecf" as const,
      ncfFiscalActive: false,
      defaultNcfType: "B01" as const,
      defaultItbisEnabled: true,
      fiscalModeFallback: "internal_receipt" as const,
      ecfEnvironment: "certification",
      rnc: "130862346",
      nombre: "CYBERBISTRO SRL",
      direccion: "Av. Winston Churchill",
      ecfIssuerSucursal: "Principal",
      ecfIssuerMunicipio: "Santo Domingo Centro",
      ecfIssuerProvincia: "Distrito Nacional",
      ecfIssuerActividadEconomica: "6201",
      ecfIssuerCorreoEmisor: "factura@cyberbistro.app",
    };

    // Resolve active fiscal mode while offline (isOnline = false)
    const activeFiscal = await resolveActiveFiscalMode("tenant-1", settings, false);
    expect(activeFiscal).toEqual({ mode: "dgii_ecf", certificateId: null });
    expect(localStorage.getItem("ecf_cert_id_tenant-1")).toBeNull();

    // Mock sequence resolution for the test
    const { resolveNcfForNewInvoiceLocalFirst } = await import("../src/shared/lib/localFirst");
    vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
      ncf: "E3100000101",
      ncf_tipo: "E31 - Factura de credito fiscal electronica",
      tipoCodigo: "E31",
      usedSequence: 101,
      sequenceReservedAtomically: true,
      reservationSource: "local_mirror",
    });

    // Run the fiscal engine to simulate checkout
    const engineResult = await runFiscalEngine({
      tenantId: "tenant-1",
      activeMode: activeFiscal.mode,
      certificateId: activeFiscal.certificateId,
      facturaId: "invoice-offline-456",
      numeroFactura: 101,
      clientRnc: "130862346", // RNC present -> E31
      deviceId: "device-offline-999",
    });

    expect(engineResult).toEqual({
      ncf: "E3100000101",
      ncf_tipo: "E31 - Factura de credito fiscal electronica",
      tipoCodigo: "E31",
      usedSequence: 101,
      sequenceReservedAtomically: true,
      reservationSource: "local_mirror",
      certificateId: null,
      ecfType: "31",
    });

    // POS explicitly enqueues e-CF documents after invoice is created locally
    const { enqueueEcfDocuments } = await import("../src/shared/lib/fiscalEngine");
    await enqueueEcfDocuments({
      tenantId: "tenant-1",
      facturaId: "invoice-offline-456",
      certificateId: activeFiscal.certificateId,
      ecfType: engineResult!.ecfType!,
      deviceId: "device-offline-999",
      ecfDocumentId: "ecf-doc-123",
    });

    // Check that two local-first entries are queued: ecf_documents and fiscal_outbox
    expect(localWrites).toHaveLength(2);
    const docWrite = localWrites.find((w) => w.tableName === "ecf_documents");
    const outboxWrite = localWrites.find((w) => w.tableName === "fiscal_outbox");

    expect(docWrite).toBeDefined();
    expect(docWrite.payload).toMatchObject({
      tenant_id: "tenant-1",
      factura_id: "invoice-offline-456",
      certificate_metadata_id: null,
      ecf_type: "31",
      status: "pending_configuration",
    });
    expect(docWrite.payload).not.toHaveProperty("passphrase");
    expect(docWrite.payload).not.toHaveProperty("password");
    expect(docWrite.payload).not.toHaveProperty("p12Bytes");

    expect(outboxWrite).toBeDefined();
    expect(outboxWrite.payload).toMatchObject({
      tenant_id: "tenant-1",
      factura_id: "invoice-offline-456",
      operation: "submit",
      status: "blocked_configuration",
      idempotency_key: "tenant-1:invoice-offline-456:submit",
    });
    expect(outboxWrite.payload).not.toHaveProperty("passphrase");
    expect(outboxWrite.payload).not.toHaveProperty("password");
    expect(outboxWrite.payload).not.toHaveProperty("p12Bytes");

    // 2. RECONNECT & WORKER EXECUTION
    // Simulate that the client has reconnected and sync'ed these records to the server.
    // The server-side repository state for these records:
    const repositoryState = {
      job: {
        id: outboxWrite.rowId,
        tenantId: "tenant-1",
        ecfDocumentId: docWrite.rowId,
        facturaId: "invoice-offline-456",
        operation: "submit" as const,
        status: "queued" as const,
        attempts: 0,
        idempotencyKey: outboxWrite.payload.idempotency_key,
      },
      document: {
        id: docWrite.rowId,
        tenantId: "tenant-1",
        facturaId: "invoice-offline-456",
        status: "queued" as const,
        certificateMetadataId: null,
        dgiiTrackId: null,
      },
      certificate: {
        id: "cert-offline-123",
        tenantId: "tenant-1",
        environment: "certification",
        isReady: true,
        validUntil: "2028-01-01T00:00:00.000Z",
      },
      invoicePayload: {
        factura: {
          total: 118,
          itbis: 18,
          subtotal: 100,
          created_at: "2026-06-10T12:00:00.000Z",
          cliente_rnc: "123456789",
          cliente_nombre: "Cliente de Prueba",
          ncf: "E3100000001",
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
        },
        items: [],
        payments: [],
      },
    };

    // Keep track of document and job updates
    const documentUpdates: any[] = [];
    const jobUpdates: any[] = [];
    const auditEvents: FiscalAuditEvent[] = [];

    const repository: FiscalWorkerRepository = {
      claimJob: vi.fn().mockImplementation(async (jobId, claimInfo) => {
        // If the document is already in a terminal/submitted state, return already_done
        if (repositoryState.document.status === "submitted" || repositoryState.document.status === "accepted") {
          return { kind: "already_done", jobId };
        }
        return { kind: "claimed", snapshot: repositoryState };
      }),
      recordAudit: vi.fn(async (event) => {
        auditEvents.push(event);
      }),
      updateDocument: vi.fn(async (documentId, update) => {
        documentUpdates.push(update);
        Object.assign(repositoryState.document, update);
      }),
      updateJob: vi.fn(async (jobId, update) => {
        jobUpdates.push(update);
        Object.assign(repositoryState.job, update);
      }),
    };

    const custody: CertificateCustody = {
      getSigningMaterial: vi.fn(async () => ({
        ok: true,
        value: {
          certificateId: "cert-offline-123",
          tenantId: "tenant-1",
          environment: "certification",
          p12Bytes: new Uint8Array([9, 8, 7]),
          passphrase: "secure",
        } satisfies SigningMaterial,
      }) as const),
    };

    const signer: XmlSignerAdapter = {
      signXml: vi.fn(async ({ unsignedXml }) => ({
        signedXml: `<Signed>${unsignedXml}</Signed>`,
        storageKey: "signed-storage-key",
      })),
    };

    const dgii: DgiiClientAdapter = {
      submitSignedXml: vi.fn(async () => ({
        kind: "submitted",
        trackId: "TRK-OFFLINE-SYNC-987",
        statusCode: "REC",
      }) as const),
      pollStatus: vi.fn(),
    };

    // Instantiate fiscal worker on the server/reconnected state
    const worker = new FiscalWorker({
      repository,
      custody,
      signer,
      dgii,
      workerId: "worker-reconnect-1",
      now: () => now,
    });

    expect(custody.getSigningMaterial).not.toHaveBeenCalled();

    // Run the worker processing for the job
    const runResult = await worker.processJob(outboxWrite.rowId);

    // Verify processing was successful
    expect(runResult).toEqual({
      kind: "processed",
      jobId: outboxWrite.rowId,
      operation: "submit",
      status: "submitted",
    });

    // Verify signer was called and XML signed
    expect(signer.signXml).toHaveBeenCalled();
    const expectedUnsigned = createUnsignedEcfXml(repositoryState as any, now);
    const expectedSigned = `<Signed>${expectedUnsigned}</Signed>`;
    const expectedHash = createHash("sha256").update(expectedSigned).digest("hex");

    // Verify document was updated with hash and submitted status
    expect(documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "signed",
        certificateMetadataId: "cert-offline-123",
        dgiiSecurityCode: expect.any(String),
        xmlHash: expectedHash,
      })
    );
    expect(documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "submitted",
        dgiiTrackId: "TRK-OFFLINE-SYNC-987",
      })
    );

    // Verify job was completed
    expect(jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "done",
      })
    );

    // Verify audit logs are correctly generated
    expect(auditEvents.map((e) => e.eventType)).toEqual([
      "job_started",
      "xml_signed",
      "dgii_submitted",
      "job_completed",
    ]);

    // 3. IDEMPOTENCY SAFETY DEDUPLICATION
    // Rerun the same job to simulate a duplicate execution or a parallel worker claim attempt
    const rerunResult = await worker.processJob(outboxWrite.rowId);

    // The worker must skip because the repository shows the document status is already submitted/done
    expect(rerunResult).toEqual({
      kind: "skipped",
      reason: "already_done",
      jobId: outboxWrite.rowId,
    });

    // Ensure DGII submission is not repeated
    expect(dgii.submitSignedXml).toHaveBeenCalledTimes(1);
  });
});
