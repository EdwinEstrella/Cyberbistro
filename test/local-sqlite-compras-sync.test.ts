import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";
import { CashPurchaseRepository } from "../electron/persistence/cashPurchaseRepository";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-test-compras";

describe("Compras SQLite local-first sync (Push & Query)", () => {
  let db: DatabaseSync;
  let store: TenantStore;
  let repo: CashPurchaseRepository;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    store = (TenantStore as any).openInMemory?.(db, TENANT) ?? (() => {
      // Access private constructor for in-memory testing
      const instance = Object.create(TenantStore.prototype);
      (instance as any).database = db;
      (instance as any).databasePath = ":memory:";
      (instance as any).tenantId = TENANT;
      return instance as TenantStore;
    })();
    repo = new CashPurchaseRepository({ store, branchId: "branch-1" });
  });

  afterEach(() => {
    db.close();
  });

  it("executes a full purchase.create command and populates SQLite tables and outbox", () => {
    repo.execute({
      type: "purchase.create",
      id: "compra-100",
      supplierId: "prov-1",
      providerName: "Distribuidora Central",
      numeroFactura: "B0100001234",
      tipoPago: "contado",
      metodoPago: "efectivo",
      montoPagado: 5000,
      fechaCompra: "2026-09-19T20:30:00Z",
      total: 5000,
      cycleId: "cycle-1",
      items: [
        {
          id: "det-100",
          productoId: "prod-carne",
          cantidad: 20,
          costoUnitario: 250,
          total: 5000,
          movimientoId: "mov-100",
          stockAntes: 10,
          stockDespues: 30,
        },
      ],
      fiscal: {
        id: "fisc-100",
        rncCedula: "101000001",
        ncf: "B0100001234",
        fechaComprobante: "2026-09-19",
        montoBienes: 5000,
        totalFacturado: 5000,
        itbisFacturado: 900,
      },
      expense: {
        id: "gasto-compra-100",
        categoryId: "cat-compras",
        amount: 5000,
        paymentMethod: "cash",
        description: "Compra insumos - Factura: B0100001234",
      },
    });

    // Check compras
    const compra = db.prepare("SELECT * FROM compras WHERE id = 'compra-100'").get() as any;
    expect(compra).toBeTruthy();
    expect(compra.numero_factura).toBe("B0100001234");
    expect(compra.total).toBe(5000);
    expect(compra.tipo_pago).toBe("contado");

    // Check detalles_compra
    const detalle = db.prepare("SELECT * FROM detalles_compra WHERE compra_id = 'compra-100'").get() as any;
    expect(detalle).toBeTruthy();
    expect(detalle.quantity).toBe(20);
    expect(detalle.unit_cost).toBe(250);

    // Check movimientos_inventario
    const movimiento = db.prepare("SELECT * FROM movimientos_inventario WHERE compra_id = 'compra-100'").get() as any;
    expect(movimiento).toBeTruthy();
    expect(movimiento.quantity).toBe(20);

    // Check gastos
    const gasto = db.prepare("SELECT * FROM gastos WHERE compra_id = 'compra-100'").get() as any;
    expect(gasto).toBeTruthy();
    expect(gasto.amount).toBe(5000);

    // Check sync_outbox
    const outboxRows = db.prepare("SELECT table_name, operation, status FROM sync_outbox WHERE tenant_id = ?").all(TENANT) as any[];
    expect(outboxRows.length).toBeGreaterThanOrEqual(4);
    const tables = outboxRows.map(r => r.table_name);
    expect(tables).toContain("compras");
    expect(tables).toContain("compra_detalles");
    expect(tables).toContain("inventario_movimientos");
    expect(tables).toContain("compra_fiscal");
  });

  it("lists purchases with listCompras ordered by date", () => {
    store.executeCashPurchaseCommand({
      command: {
        type: "purchase.create",
        id: "c-1",
        supplierId: "prov-1",
        fechaCompra: "2026-09-18T10:00:00Z",
        total: 1000,
        tipoPago: "contado",
        items: [],
      },
      commitId: "commit-1",
      branchId: "branch-1",
    });

    store.executeCashPurchaseCommand({
      command: {
        type: "purchase.create",
        id: "c-2",
        supplierId: "prov-1",
        fechaCompra: "2026-09-19T10:00:00Z",
        total: 2000,
        tipoPago: "contado",
        items: [],
      },
      commitId: "commit-2",
      branchId: "branch-1",
    });

    const list = store.listCompras();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe("c-2"); // Most recent first
    expect(list[1].id).toBe("c-1");

    // Filter by date
    const filtered = store.listCompras({ dateFrom: "2026-09-19" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("c-2");
  });

  it("pushes all purchase outbox mutations to Supabase without errors", async () => {
    repo.execute({
      type: "purchase.create",
      id: "c-push-1",
      supplierId: "prov-1",
      numeroFactura: "FAC-1",
      tipoPago: "contado",
      fechaCompra: "2026-09-19T12:00:00Z",
      total: 3000,
      items: [
        {
          id: "det-push-1",
          productoId: "prod-pan",
          cantidad: 10,
          costoUnitario: 300,
          total: 3000,
        },
      ],
    });

    const pushedTables: string[] = [];
    const upsertFn = vi.fn((payload: any) => {
      return { error: null };
    });
    const cloudClient = {
      from: vi.fn((table: string) => {
        pushedTables.push(table);
        return {
          upsert: upsertFn,
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }),
    };

    const syncStore = new SQLitePayrollSyncStore(db, TENANT);
    const worker = new DurableSyncWorker(syncStore, new PayrollSyncClient(cloudClient as any), TENANT);

    const { pushed, conflicted } = await worker.push();
    expect(conflicted).toBe(0);
    expect(pushed).toBeGreaterThanOrEqual(2); // compras + compra_detalles
    expect(pushedTables).toContain("compras");
    expect(pushedTables).toContain("compra_detalles");
  });

  it("reconciles unqueued compras with ensureComprasOutboxIntegrity", () => {
    // Insert prerequisite foreign keys
    db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES ('branch-1', ?, 'Principal')").run(TENANT);
    db.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES ('prov-1', ?, 'Proveedor')").run(TENANT);

    // Insert a compra directly without outbox (simulating historical SQLite data)
    db.prepare(`
      INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status, numero_factura, fecha_compra)
      VALUES ('compra-legacy-1', ?, 'branch-1', 'prov-1', 'cash', 1500, 'pending_sync', 'FAC-LEGACY', '2026-08-10T10:00:00Z')
    `).run(TENANT);

    const outboxBefore = db.prepare("SELECT count(*) as c FROM sync_outbox WHERE table_name = 'compras'").get() as any;
    expect(outboxBefore.c).toBe(0);

    store.ensureComprasOutboxIntegrity();

    const outboxAfter = db.prepare("SELECT row_id, operation, status FROM sync_outbox WHERE table_name = 'compras'").all() as any[];
    expect(outboxAfter.length).toBe(1);
    expect(outboxAfter[0].row_id).toBe("compra-legacy-1");
    expect(outboxAfter[0].operation).toBe("upsert");
    expect(outboxAfter[0].status).toBe("pending");
  });
});
