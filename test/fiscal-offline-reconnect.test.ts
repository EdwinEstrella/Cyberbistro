import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveActiveFiscalMode, runFiscalEngine } from "../src/shared/lib/fiscalEngine";
import { enqueueLocalWrite } from "../src/shared/lib/localFirst";
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
vi.mock("../src/shared/lib/insforge", () => ({
  insforgeClient: {
    database: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(),
            })),
            maybeSingle: vi.fn(),
          })),
        })),
      })),
    },
  },
}));

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
    // Preset cached certificate in localStorage for offline usage
    localStorage.setItem("ecf_cert_id_tenant-1", "cert-offline-123");

    const settings = {
      fiscalMode: "dgii_ecf" as const,
      ncfFiscalActive: false,
      defaultNcfType: "B01" as const,
      defaultItbisEnabled: true,
      fiscalModeFallback: "internal_receipt" as const,
      ecfEnvironment: "certification",
    };

    // Resolve active fiscal mode while offline (isOnline = false)
    const activeFiscal = await resolveActiveFiscalMode("tenant-1", settings, false);
    expect(activeFiscal).toEqual({ mode: "dgii_ecf", certificateId: "cert-offline-123" });

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

    // Verify correct local-first e-NCF generation
    expect(engineResult).toEqual({
      ncf: "E3100000101",
      ncf_tipo: "E31 - Factura de credito fiscal electronica",
      tipoCodigo: "E31",
      usedSequence: 101,
      sequenceReservedAtomically: true,
      reservationSource: "dgii_ecf_engine",
    });

    // Check that two local-first entries are queued: ecf_documents and fiscal_outbox
    expect(localWrites).toHaveLength(2);
    const docWrite = localWrites.find((w) => w.tableName === "ecf_documents");
    const outboxWrite = localWrites.find((w) => w.tableName === "fiscal_outbox");

    expect(docWrite).toBeDefined();
    expect(docWrite.payload).toMatchObject({
      tenant_id: "tenant-1",
      factura_id: "invoice-offline-456",
      certificate_metadata_id: "cert-offline-123",
      ecf_type: "31",
      status: "pending_sync",
    });

    expect(outboxWrite).toBeDefined();
    expect(outboxWrite.payload).toMatchObject({
      tenant_id: "tenant-1",
      factura_id: "invoice-offline-456",
      operation: "submit",
      status: "queued",
      idempotency_key: "tenant-1:invoice-offline-456:submit",
    });

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
        certificateMetadataId: "cert-offline-123",
        dgiiTrackId: null,
      },
      certificate: {
        id: "cert-offline-123",
        tenantId: "tenant-1",
        environment: "certification",
        isReady: true,
        validUntil: "2028-01-01T00:00:00.000Z",
      },
      invoicePayload: { subtotal: 100, tax: 18, total: 118 },
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
    const expectedHash = createHash("sha256")
      .update(`<Signed><ECF tenantId="tenant-1" documentId="${docWrite.rowId}"><FacturaId>invoice-offline-456</FacturaId><Payload>{"subtotal":100,"tax":18,"total":118}</Payload></ECF></Signed>`)
      .digest("hex");

    // Verify document was updated with hash and submitted status
    expect(documentUpdates).toContainEqual(
      expect.objectContaining({
        status: "signed",
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
