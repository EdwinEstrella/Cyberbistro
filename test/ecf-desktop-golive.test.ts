import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { SUPPORTED_OUTBOX_TABLES, SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { PayrollSyncClient, upsertOptionsForRemoteTable } from "../electron/persistence/payrollSyncClient";
import { TenantStore } from "../electron/persistence/tenantStore";
import { backfillUnpushedFiscalRows } from "../electron/persistence/fiscalBackfill";
import { applyCloudFacturaRows } from "../electron/persistence/cloudApply";
import type { DurableOperation } from "../electron/persistence/syncWorker";
import type { DesktopCheckoutCommand } from "../src/shared/lib/checkoutContracts";

function createFakeSdk() {
  const from = vi.fn();
  const upsert = vi.fn(async () => ({ error: null }));
  const eq = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(() => ({ eq }));
  const rpc = vi.fn(async () => ({ error: null }));

  from.mockImplementation(() => ({
    upsert: async (...args: unknown[]) => upsert(...args),
    update: () => ({
      eq: () => ({
        select: async () => ({ data: [], error: null }),
      }),
    }),
    delete: () => ({
      eq: async (...args: unknown[]) => eq(...args),
    }),
  }));

  return { client: { from, rpc }, from, upsert, rpc, delete: remove, eq };
}

describe("ECF Desktop Go-Live (T1 - T4 & Review Fixes)", () => {
  let db: DatabaseSync;
  let fakeSdk: ReturnType<typeof createFakeSdk>;
  let client: PayrollSyncClient;
  const tenantId = "tenant-golive-1";
  const branchId = "branch-golive-1";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, tenantId);
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, tenantId, "Principal");
    fakeSdk = createFakeSdk();
    client = new PayrollSyncClient(fakeSdk.client as never);
  });

  describe("T1: Whitelist, Mappers, and Append-Only Upsert", () => {
    it("includes ecf_documents and fiscal_outbox in SUPPORTED_OUTBOX_TABLES", () => {
      expect(SUPPORTED_OUTBOX_TABLES).toContain("ecf_documents");
      expect(SUPPORTED_OUTBOX_TABLES).toContain("fiscal_outbox");
    });

    it("upsertOptionsForRemoteTable returns expected conflict keys and duplicate flags", () => {
      expect(upsertOptionsForRemoteTable("fiscal_outbox")).toEqual({
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      });
      expect(upsertOptionsForRemoteTable("ecf_documents")).toEqual({
        onConflict: "id",
        ignoreDuplicates: true,
      });
      expect(upsertOptionsForRemoteTable("mesas_estado")).toEqual({
        onConflict: "tenant_id,id",
      });
      expect(upsertOptionsForRemoteTable("facturas")).toEqual({
        onConflict: "id",
      });
    });

    it("maps ecf_documents with status translation, cloud column whitelist, and onConflict 'id' with ignoreDuplicates: true", async () => {
      const docOperation: DurableOperation = {
        id: "outbox-doc-1",
        tenantId,
        branchId,
        tableName: "ecf_documents",
        rowId: "ecf-doc-uuid-1",
        op: "upsert",
        payload: {
          id: "ecf-doc-uuid-1",
          tenant_id: tenantId,
          sucursal_id: branchId, // local only - must be dropped
          factura_id: "factura-uuid-1",
          document_type: "E31", // local field - must be mapped to ecf_type
          status: "pending_offline", // must be translated to queued
          certificate_metadata_id: "cert-uuid-1",
          dgii_track_id: "track-123",
          created_at: "2026-11-05T12:00:00Z",
          updated_at: "2026-11-05T12:00:00Z",
        },
        payloadHash: "hash-1",
        sequence: 0,
        deviceId: "local",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const res = await client.push(docOperation);
      expect(res.permanent).toBeUndefined();
      expect(fakeSdk.from).toHaveBeenCalledWith("ecf_documents");

      const [pushedPayload, pushOptions] = fakeSdk.upsert.mock.calls[0];
      expect(pushOptions).toEqual({ onConflict: "id", ignoreDuplicates: true });

      // Column whitelist checks
      expect(pushedPayload).toEqual({
        id: "ecf-doc-uuid-1",
        tenant_id: tenantId,
        factura_id: "factura-uuid-1",
        ecf_type: "E31",
        status: "queued",
        certificate_metadata_id: "cert-uuid-1",
        dgii_track_id: "track-123",
        created_at: "2026-11-05T12:00:00Z",
        updated_at: "2026-11-05T12:00:00Z",
      });
      expect(pushedPayload).not.toHaveProperty("sucursal_id");
      expect(pushedPayload).not.toHaveProperty("document_type");
    });

    it("maps fiscal_outbox with status translation, cloud columns, and onConflict 'idempotency_key' with ignoreDuplicates: true", async () => {
      const fiscalOperation: DurableOperation = {
        id: "outbox-job-1",
        tenantId,
        branchId,
        tableName: "fiscal_outbox",
        rowId: "fiscal-job-uuid-1",
        op: "upsert",
        payload: {
          id: "fiscal-job-uuid-1",
          tenant_id: tenantId,
          sucursal_id: branchId, // local only - must be dropped
          ecf_document_id: "ecf-doc-uuid-1",
          factura_id: "factura-uuid-1",
          operation: "submit",
          status: "pending_sync", // must be translated to queued
          attempts: 0,
          idempotency_key: `${tenantId}:factura-uuid-1:submit`,
          next_attempt_at: "2026-11-05T12:00:00Z",
          created_at: "2026-11-05T12:00:00Z",
          updated_at: "2026-11-05T12:00:00Z",
        },
        payloadHash: "hash-2",
        sequence: 0,
        deviceId: "local",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const res = await client.push(fiscalOperation);
      expect(res.permanent).toBeUndefined();
      expect(fakeSdk.from).toHaveBeenCalledWith("fiscal_outbox");

      const [pushedPayload, pushOptions] = fakeSdk.upsert.mock.calls[0];
      expect(pushOptions).toEqual({ onConflict: "idempotency_key", ignoreDuplicates: true });

      expect(pushedPayload).toEqual({
        id: "fiscal-job-uuid-1",
        tenant_id: tenantId,
        ecf_document_id: "ecf-doc-uuid-1",
        factura_id: "factura-uuid-1",
        operation: "submit",
        status: "queued",
        attempts: 0,
        idempotency_key: `${tenantId}:factura-uuid-1:submit`,
        next_attempt_at: "2026-11-05T12:00:00Z",
        created_at: "2026-11-05T12:00:00Z",
        updated_at: "2026-11-05T12:00:00Z",
      });
      expect(pushedPayload).not.toHaveProperty("sucursal_id");
    });

    it("uses ignoreDuplicates on a second push of the same ecf_documents and fiscal_outbox", async () => {
      const docOp: DurableOperation = {
        id: "outbox-doc-2",
        tenantId,
        branchId,
        tableName: "ecf_documents",
        rowId: "ecf-doc-uuid-2",
        op: "upsert",
        payload: {
          id: "ecf-doc-uuid-2",
          tenant_id: tenantId,
          factura_id: "factura-uuid-2",
          document_type: "E31",
          status: "pending_offline",
        },
        payloadHash: "hash-doc-2",
        sequence: 0,
        deviceId: "local",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      await client.push(docOp);
      const [, firstDocOpts] = fakeSdk.upsert.mock.calls[0];
      expect(firstDocOpts).toEqual({ onConflict: "id", ignoreDuplicates: true });

      await client.push(docOp);
      const [, secondDocOpts] = fakeSdk.upsert.mock.calls[1];
      expect(secondDocOpts).toEqual({ onConflict: "id", ignoreDuplicates: true });

      const fiscalOp: DurableOperation = {
        id: "outbox-job-2",
        tenantId,
        branchId,
        tableName: "fiscal_outbox",
        rowId: "fiscal-job-uuid-2",
        op: "upsert",
        payload: {
          id: "fiscal-job-uuid-2",
          tenant_id: tenantId,
          ecf_document_id: "ecf-doc-uuid-2",
          factura_id: "factura-uuid-2",
          status: "pending_sync",
          idempotency_key: `${tenantId}:factura-uuid-2:submit`,
        },
        payloadHash: "hash-job-2",
        sequence: 0,
        deviceId: "local",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      await client.push(fiscalOp);
      const [, fiscalOpts] = fakeSdk.upsert.mock.calls[2];
      expect(fiscalOpts).toEqual({ onConflict: "idempotency_key", ignoreDuplicates: true });
    });
  });

  describe("T2: Facturas Fiscal Fields and Pull Non-Downgrade", () => {
    it("sends fiscal_mode, fiscal_status, and fiscal_document_id in mapFacturaPayload", async () => {
      const facturaOp: DurableOperation = {
        id: "outbox-factura-1",
        tenantId,
        branchId,
        tableName: "facturas",
        rowId: "factura-uuid-1",
        op: "upsert",
        payload: {
          id: "factura-uuid-1",
          tenant_id: tenantId,
          sucursal_id: branchId,
          numero_factura: 1001,
          total: 500,
          fiscal_mode: "dgii_ecf",
          fiscal_status: "pending_sync",
          fiscal_document_id: "ecf-doc-uuid-1",
          ncf: "E3100000001",
          ncf_tipo: "E31",
        },
        payloadHash: "hash-3",
        sequence: 0,
        deviceId: "local",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      await client.push(facturaOp);
      expect(fakeSdk.from).toHaveBeenCalledWith("facturas");
      const [pushedFactura] = fakeSdk.upsert.mock.calls[0];

      expect(pushedFactura.fiscal_mode).toBe("dgii_ecf");
      expect(pushedFactura.fiscal_status).toBe("pending_sync");
      expect(pushedFactura.fiscal_document_id).toBe("ecf-doc-uuid-1");
    });

    it("does not downgrade local 'dgii_ecf' to 'ncf_legacy' nor null an existing local ncf during pull", () => {
      db.prepare(`
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, ncf, ncf_tipo)
        VALUES (?, ?, ?, 'dgii_ecf', 500, 'committed', 'E3100000001', 'E31')
      `).run("factura-pull-1", tenantId, branchId);

      const cloudRows = [
        {
          id: "factura-pull-1",
          tenant_id: tenantId,
          sucursal_id: branchId,
          fiscal_mode: "ncf_legacy",
          total: 600,
          ncf: null,
          ncf_tipo: null,
        },
      ];

      applyCloudFacturaRows(db, tenantId, cloudRows, branchId);

      const updated = db.prepare("SELECT fiscal_mode, total, ncf, ncf_tipo FROM facturas WHERE id = ?").get("factura-pull-1") as any;
      expect(updated.fiscal_mode).toBe("dgii_ecf");
      expect(updated.ncf).toBe("E3100000001");
      expect(updated.ncf_tipo).toBe("E31");
      expect(updated.total).toBe(600);
    });

    it("protects dgii_ecf and ncf during TenantStore.saveInvoice conflict updates", () => {
      const store = new (TenantStore as any)(db, ":memory:", tenantId);
      const targetDb = store.getDatabase ? store.getDatabase() : db;

      store.saveInvoice({
        id: "inv-save-1",
        tenant_id: tenantId,
        sucursal_id: branchId,
        fiscal_mode: "dgii_ecf",
        total: 500,
        ncf: "E3100000002",
        ncf_tipo: "E31",
      });

      store.saveInvoice({
        id: "inv-save-1",
        tenant_id: tenantId,
        sucursal_id: branchId,
        fiscal_mode: "ncf_legacy",
        total: 750,
        ncf: null,
        ncf_tipo: null,
      });

      const updated = targetDb.prepare("SELECT fiscal_mode, total, ncf, ncf_tipo FROM facturas WHERE id = 'inv-save-1'").get() as any;
      expect(updated.fiscal_mode).toBe("dgii_ecf");
      expect(updated.ncf).toBe("E3100000002");
      expect(updated.ncf_tipo).toBe("E31");
      expect(updated.total).toBe(750);
    });
  });

  describe("T1 & T4: applyCheckoutFiscalWrite atomicity and ordering", () => {
    it("enqueues ecf_documents and fiscal_outbox into sync_outbox in order facturas -> ecf_documents -> fiscal_outbox", () => {
      const store = new (TenantStore as any)(db, ":memory:", tenantId);

      const command: DesktopCheckoutCommand = {
        tenantId,
        branchId,
        commitId: "checkout-commit-1",
        invoiceId: "inv-test-1",
        fiscalMode: "dgii_ecf",
        total: 1000,
        writes: [
          {
            tenantId,
            tableName: "fiscal_outbox",
            rowId: "job-1",
            op: "insert",
            payload: {
              id: "job-1",
              tenant_id: tenantId,
              sucursal_id: branchId,
              ecf_document_id: "doc-1",
              factura_id: "inv-test-1",
              operation: "submit",
              status: "pending_sync",
              attempts: 0,
              idempotency_key: `${tenantId}:inv-test-1:submit`,
            },
          },
          {
            tenantId,
            tableName: "ecf_documents",
            rowId: "doc-1",
            op: "insert",
            payload: {
              id: "doc-1",
              tenant_id: tenantId,
              sucursal_id: branchId,
              factura_id: "inv-test-1",
              ecf_type: "E31",
              status: "pending_offline",
            },
          },
          {
            tenantId,
            tableName: "facturas",
            rowId: "inv-test-1",
            op: "insert",
            payload: {
              id: "inv-test-1",
              tenant_id: tenantId,
              sucursal_id: branchId,
              fiscal_mode: "dgii_ecf",
              total: 1000,
              items: [],
            },
          },
        ],
      };

      store.commitCheckout(command);

      const outboxRows = (store.getDatabase ? store.getDatabase() : db)
        .prepare("SELECT table_name, row_id FROM sync_outbox ORDER BY rowid ASC")
        .all() as Array<{ table_name: string; row_id: string }>;

      expect(outboxRows.map((r) => r.table_name)).toEqual([
        "facturas",
        "ecf_documents",
        "fiscal_outbox",
      ]);

      const syncStore = new SQLitePayrollSyncStore(store.getDatabase ? store.getDatabase() : db, tenantId);
      const claimed = syncStore.claim(Date.now());
      expect(claimed.map((op) => op.tableName)).toEqual([
        "facturas",
        "ecf_documents",
        "fiscal_outbox",
      ]);
    });

    it("rolls back both fiscal tables and sync_outbox atomically if checkout fails", () => {
      const store = new (TenantStore as any)(db, ":memory:", tenantId);

      const invalidCommand: DesktopCheckoutCommand = {
        tenantId,
        branchId,
        commitId: "checkout-fail-1",
        invoiceId: "inv-fail-1",
        fiscalMode: "dgii_ecf",
        total: 1000,
        writes: [
          {
            tenantId,
            tableName: "ecf_documents",
            rowId: "doc-fail-1",
            op: "insert",
            payload: {
              id: "doc-fail-1",
              tenant_id: tenantId,
              sucursal_id: branchId,
              factura_id: "inv-fail-1",
              ecf_type: "E31",
              status: "pending_offline",
            },
          },
          {
            tenantId,
            tableName: "facturas",
            rowId: "inv-fail-1",
            op: "delete",
            payload: null,
          },
        ],
      };

      const targetDb = store.getDatabase ? store.getDatabase() : db;
      expect(() => store.commitCheckout(invalidCommand)).toThrow();

      const ecfCount = targetDb.prepare("SELECT COUNT(*) as count FROM ecf_documents WHERE id = 'doc-fail-1'").get() as { count: number };
      const outboxCount = targetDb.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE row_id = 'doc-fail-1'").get() as { count: number };

      expect(ecfCount.count).toBe(0);
      expect(outboxCount.count).toBe(0);
    });
  });

  describe("T1 / Review 1: Local pushed tracking on settle", () => {
    it("marks ecf_documents 'queued' and fiscal_outbox 'queued' locally when sync_outbox settles as synced in the same transaction", () => {
      // Seed local rows in pending state
      db.prepare(`
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
        VALUES ('inv-settle-1', ?, ?, 'dgii_ecf', 500, 'pending_sync')
      `).run(tenantId, branchId);

      db.prepare(`
        INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
        VALUES ('doc-settle-1', ?, ?, 'inv-settle-1', 'E31', 'pending_offline')
      `).run(tenantId, branchId);

      db.prepare(`
        INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, ecf_document_id, operation, status, idempotency_key)
        VALUES ('job-settle-1', ?, ?, 'inv-settle-1', 'doc-settle-1', 'submit', 'pending_sync', 'idem-settle-1')
      `).run(tenantId, branchId);

      // Seed sync_outbox rows
      db.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES
          ('outbox-s-1', ?, ?, 'ecf_documents', 'doc-settle-1', 'upsert', '{}', 'syncing'),
          ('outbox-s-2', ?, ?, 'fiscal_outbox', 'job-settle-1', 'upsert', '{}', 'syncing')
      `).run(tenantId, branchId, tenantId, branchId);

      const syncStore = new SQLitePayrollSyncStore(db, tenantId);

      // Settle ecf_documents
      syncStore.settle("outbox-s-1", "synced", {});
      const docRow = db.prepare("SELECT status FROM ecf_documents WHERE id = ?").get("doc-settle-1") as { status: string };
      expect(docRow.status).toBe("queued");
      const outbox1 = db.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE id = 'outbox-s-1'").get() as { count: number };
      expect(outbox1.count).toBe(0);

      // Settle fiscal_outbox
      syncStore.settle("outbox-s-2", "synced", {});
      const fiscalRow = db.prepare("SELECT status FROM fiscal_outbox WHERE id = ?").get("job-settle-1") as { status: string };
      expect(fiscalRow.status).toBe("queued");
      const outbox2 = db.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE id = 'outbox-s-2'").get() as { count: number };
      expect(outbox2.count).toBe(0);
    });
  });

  describe("T3 & Review: Backfill unpushed fiscal rows", () => {
    it("backfills stuck unpushed rows and their facturas, but enqueues 0 rows on second run after push settles", () => {
      const store = new (TenantStore as any)(db, ":memory:", tenantId);

      db.prepare(`
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
        VALUES ('stuck-inv-1', ?, ?, 'dgii_ecf', 800, 'pending_sync')
      `).run(tenantId, branchId);

      db.prepare(`
        INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
        VALUES ('stuck-doc-1', ?, ?, 'stuck-inv-1', 'E31', 'pending_offline')
      `).run(tenantId, branchId);

      db.prepare(`
        INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, ecf_document_id, operation, status, idempotency_key)
        VALUES ('stuck-job-1', ?, ?, 'stuck-inv-1', 'stuck-doc-1', 'submit', 'pending_sync', 'idem-1')
      `).run(tenantId, branchId);

      // Initial backfill enqueues facturas, ecf_documents, fiscal_outbox
      const res1 = backfillUnpushedFiscalRows(db, tenantId);
      expect(res1).toEqual({
        facturasEnqueued: 1,
        ecfDocumentsEnqueued: 1,
        fiscalOutboxEnqueued: 1,
      });

      // Claim and settle all three operations as synced
      const syncStore = new SQLitePayrollSyncStore(db, tenantId);
      const claimed = syncStore.claim(Date.now());
      expect(claimed.length).toBe(3);

      for (const op of claimed) {
        syncStore.settle(op.id, "synced", {});
      }

      // Check local rows are now 'queued'
      const doc = db.prepare("SELECT status FROM ecf_documents WHERE id = 'stuck-doc-1'").get() as { status: string };
      expect(doc.status).toBe("queued");
      const job = db.prepare("SELECT status FROM fiscal_outbox WHERE id = 'stuck-job-1'").get() as { status: string };
      expect(job.status).toBe("queued");

      // Running backfill again after successful push must enqueue 0 rows
      const res2 = backfillUnpushedFiscalRows(db, tenantId);
      expect(res2).toEqual({
        facturasEnqueued: 0,
        ecfDocumentsEnqueued: 0,
        fiscalOutboxEnqueued: 0,
      });

      const outboxCount = db.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE tenant_id = ?").get(tenantId) as { count: number };
      expect(outboxCount.count).toBe(0);
    });

    it("repairs local factura fiscal_mode to 'dgii_ecf' and includes fiscal_document_id and fiscal_status in enqueued payload", () => {
      const invId = "inv-repair-1";
      const docId = "doc-repair-1";
      const outboxJobId = "job-repair-1";

      db.prepare(`
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, ncf)
        VALUES (?, ?, ?, 'ncf_legacy', 500, 'committed', 'E3200000001')
      `).run(invId, tenantId, branchId);

      db.prepare(`
        INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
        VALUES (?, ?, ?, ?, 'E32', 'pending_offline')
      `).run(docId, tenantId, branchId, invId);

      db.prepare(`
        INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, ecf_document_id, operation, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, 'submit', 'pending_sync', 'idem-rep-1')
      `).run(outboxJobId, tenantId, branchId, invId, docId);

      const res = backfillUnpushedFiscalRows(db, tenantId);
      expect(res.facturasEnqueued).toBe(1);
      expect(res.ecfDocumentsEnqueued).toBe(1);
      expect(res.fiscalOutboxEnqueued).toBe(1);

      // Verify local factura.fiscal_mode was repaired to 'dgii_ecf'
      const repairedFactura = db.prepare("SELECT fiscal_mode FROM facturas WHERE id = ?").get(invId) as { fiscal_mode: string };
      expect(repairedFactura.fiscal_mode).toBe("dgii_ecf");

      // Verify sync_outbox enqueued factura payload has fiscal_mode 'dgii_ecf', fiscal_document_id, and fiscal_status
      const outboxFactura = db.prepare("SELECT payload_json FROM sync_outbox WHERE table_name = 'facturas' AND row_id = ?").get(invId) as { payload_json: string };
      expect(outboxFactura).toBeDefined();
      const payload = JSON.parse(outboxFactura.payload_json);
      expect(payload.fiscal_mode).toBe("dgii_ecf");
      expect(payload.fiscal_document_id).toBe(docId);
      expect(payload.fiscal_status).toBe("queued");
    });

    it("does NOT backfill rows in 'pending_configuration' or 'blocked_configuration'", () => {
      const store = new (TenantStore as any)(db, ":memory:", tenantId);

      db.prepare(`
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
        VALUES ('cfg-inv-1', ?, ?, 'dgii_ecf', 300, 'committed')
      `).run(tenantId, branchId);

      db.prepare(`
        INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
        VALUES ('cfg-doc-1', ?, ?, 'cfg-inv-1', 'E31', 'pending_configuration')
      `).run(tenantId, branchId);

      db.prepare(`
        INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, ecf_document_id, operation, status, idempotency_key)
        VALUES ('cfg-job-1', ?, ?, 'cfg-inv-1', 'cfg-doc-1', 'submit', 'blocked_configuration', 'idem-cfg-1')
      `).run(tenantId, branchId);

      const res = backfillUnpushedFiscalRows(db, tenantId);
      expect(res).toEqual({
        facturasEnqueued: 0,
        ecfDocumentsEnqueued: 0,
        fiscalOutboxEnqueued: 0,
      });

      const outboxCount = db.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE tenant_id = ?").get(tenantId) as { count: number };
      expect(outboxCount.count).toBe(0);
    });
  });
});
