import { describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-header";

function openStore(db: DatabaseSync): TenantStore {
  const instance = Object.create(TenantStore.prototype);
  (instance as any).database = db;
  (instance as any).databasePath = ":memory:";
  (instance as any).tenantId = TENANT;
  return instance as TenantStore;
}

function seed(store: TenantStore) {
  const base = {
    tenant_id: TENANT,
    sucursal_id: "branch-1",
    fiscal_mode: "ncf_legacy",
    metodo_pago: "efectivo",
    estado: "pagada",
    subtotal: 100,
    itbis: 18,
    propina: 0,
    total: 118,
    items: [{ nombre: "Pizza", cantidad: 1, precio_unitario: 100 }],
    ncf: "B0200000001",
    ncf_tipo: "B02 - Factura de registro unico de ingresos",
    cliente_nombre: "Cliente Uno",
    notas: null,
  };
  store.saveInvoice({ ...base, id: "inv-1", numero_factura: 1 });
  store.saveInvoice({ ...base, id: "inv-2", numero_factura: 2, ncf: "B0200000002" });
}

function clearOutbox(db: DatabaseSync) {
  db.prepare("DELETE FROM sync_outbox").run();
}

describe("TenantStore.updateInvoiceHeader", () => {
  it("updates only header columns and enqueues a partial outbox update", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seed(store);
    clearOutbox(db);

    const result = store.updateInvoiceHeader("inv-1", {
      ncf: "B0100000009",
      ncf_tipo: "B01 - Factura con validez fiscal / ITBIS (consumo)",
      cliente_rnc: "131234567",
      cliente_nombre: "Empresa SRL",
    });
    expect(result).toEqual({ ok: true, changed: true });

    const row = db.prepare("SELECT * FROM facturas WHERE id = 'inv-1'").get() as Record<string, unknown>;
    expect(row.ncf).toBe("B0100000009");
    expect(row.cliente_rnc).toBe("131234567");
    expect(row.cliente_nombre).toBe("Empresa SRL");
    expect(row.total).toBe(118);
    expect(row.subtotal).toBe(100);
    expect(row.numero_factura).toBe(1);
    expect(JSON.parse(String(row.items))).toHaveLength(1);
    expect(row.local_status).toBe("pending_sync");

    const outbox = db.prepare("SELECT * FROM sync_outbox").all() as Array<Record<string, unknown>>;
    expect(outbox).toHaveLength(1);
    expect(outbox[0].operation).toBe("update");
    expect(outbox[0].table_name).toBe("facturas");
    expect(outbox[0].row_id).toBe("inv-1");
    const payload = JSON.parse(String(outbox[0].payload_json));
    expect(Object.keys(payload).sort()).toEqual(
      ["cliente_nombre", "cliente_rnc", "id", "ncf", "ncf_tipo", "tenant_id", "updated_at"].sort()
    );
    expect(payload).not.toHaveProperty("items");
    expect(payload).not.toHaveProperty("total");
    db.close();
  });

  it("clears the NCF (null) when asked and does not touch other columns", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seed(store);
    clearOutbox(db);

    store.updateInvoiceHeader("inv-1", { ncf: null, ncf_tipo: null });
    const row = db.prepare("SELECT ncf, ncf_tipo, cliente_nombre FROM facturas WHERE id = 'inv-1'").get() as Record<string, unknown>;
    expect(row.ncf).toBeNull();
    expect(row.ncf_tipo).toBeNull();
    expect(row.cliente_nombre).toBe("Cliente Uno");
    db.close();
  });

  it("rejects an NCF already used by another invoice and writes nothing", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seed(store);
    clearOutbox(db);

    const result = store.updateInvoiceHeader("inv-1", { ncf: "B0200000002", ncf_tipo: "B02" });
    expect(result).toEqual({ ok: false, reason: "ncf_duplicate", numeroFactura: 2 });
    expect((db.prepare("SELECT ncf FROM facturas WHERE id = 'inv-1'").get() as any).ncf).toBe("B0200000001");
    expect(db.prepare("SELECT count(*) AS n FROM sync_outbox").get()).toEqual({ n: 0 });
    db.close();
  });

  it("returns not_found for an unknown invoice and ignores non-header fields", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seed(store);
    clearOutbox(db);

    expect(store.updateInvoiceHeader("missing", { notas: "x" })).toEqual({ ok: false, reason: "not_found" });
    expect(store.updateInvoiceHeader("inv-1", { total: 1, items: "[]" })).toEqual({ ok: true, changed: false });
    expect((db.prepare("SELECT total FROM facturas WHERE id = 'inv-1'").get() as any).total).toBe(118);
    expect(db.prepare("SELECT count(*) AS n FROM sync_outbox").get()).toEqual({ n: 0 });
    db.close();
  });

  it("pushes a header-only partial update to the cloud (never items or amounts)", async () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seed(store);
    clearOutbox(db);
    store.updateInvoiceHeader("inv-1", { notas: "corregida", cliente_nombre: "Nuevo" });

    const updates: Array<{ table: string; payload: Record<string, unknown>; id: unknown }> = [];
    const upserts: unknown[] = [];
    const cloudClient = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn((rows: unknown) => {
          upserts.push(rows);
          return { error: null };
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((_col: string, id: unknown) => ({
            select: vi.fn(async () => {
              updates.push({ table, payload, id });
              return { data: [{}], error: null };
            }),
          })),
        })),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    };

    const worker = new DurableSyncWorker(new SQLitePayrollSyncStore(db, TENANT), new PayrollSyncClient(cloudClient as any), TENANT);
    const { pushed } = await worker.push();
    expect(pushed).toBe(1);
    expect(upserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("facturas");
    expect(updates[0].id).toBe("inv-1");
    expect(Object.keys(updates[0].payload).sort()).toEqual(["cliente_nombre", "notas", "updated_at"]);
    db.close();
  });
});
