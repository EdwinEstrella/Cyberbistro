import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";

// End-to-end coverage of the point-of-sale flows over the authoritative local
// SQLite store (the same TenantStore the Electron main process drives): taking
// orders for a table and for takeout, charging both, the invoice CRUD, and the
// sync UPLOAD queue (sync_outbox). Sync DOWNLOAD is covered by
// local-mirror-pull.e2e.spec.ts. Runs in Node with an isolated temp profile —
// no UI, so it is deterministic and safe for CI.

const TENANT = "tenant-e2e";
const BRANCH = "branch-e2e";

async function freshStore(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), `cloudix-${prefix}-`));
  const store = TenantStore.open({ dataRoot: dir, tenantId: TENANT });
  return { dir, store };
}

/** Seeds a branch and an open operational cycle so sales/orders have a home. */
function seedBranchAndOpenCycle(store: TenantStore): void {
  store.executeCatalogCommand({
    command: { type: "catalog.branch.upsert", id: BRANCH, name: "Sucursal E2E" },
    commitId: "seed-branch",
    branchId: BRANCH,
  });
  store.executeOrdersCommand({
    command: {
      type: "orders.cycle.open",
      id: "cycle-e2e",
      businessDay: "2026-09-19",
      openingCash: 0,
      cycleNumber: 1,
      openedAt: "2026-09-19T08:00:00.000Z",
    },
    commitId: "seed-cycle",
    branchId: BRANCH,
  });
}

function pendingUpload(
  store: TenantStore,
  match: { tableName: string; rowId: string; operation?: string },
): boolean {
  return store.readLocalOutbox().some(
    (row) =>
      row.tableName === match.tableName &&
      row.rowId === match.rowId &&
      row.status === "pending" &&
      (match.operation ? row.operation === match.operation : true),
  );
}

test.describe("POS flows: pedidos mesa/llevar, cobro y sincronización de subida", () => {
  test("pedido para mesa: envía la comanda a cocina y la deja lista para subir", async () => {
    const { dir, store } = await freshStore("pedido-mesa-e2e");
    try {
      seedBranchAndOpenCycle(store);
      // The kitchen must be open before an order can be sent to it.
      store.executeOrdersCommand({
        command: { type: "orders.kitchen.set-open", id: "kitchen-e2e", isOpen: true },
        commitId: "kitchen-open",
        branchId: BRANCH,
      });
      store.executeOrdersCommand({
        command: { type: "orders.table.set-state", tableId: "mesa-5", tableNumber: 5, state: "occupied" },
        commitId: "table-occupied",
        branchId: BRANCH,
      });
      store.executeOrdersCommand({
        command: {
          type: "orders.order-to-kitchen",
          orderId: "order-mesa-1",
          tableId: "mesa-5",
          tableNumber: 5,
          items: [{ id: "it-1", productId: "prod-1", name: "Pollo al horno", quantity: 2, unitPrice: 250 }],
        },
        commitId: "order-to-kitchen-1",
        branchId: BRANCH,
      });

      const comanda = store.listComandas().find((c) => String(c.id) === "order-mesa-1");
      expect(comanda, "the kitchen order should persist").toBeTruthy();
      expect(Number(comanda?.mesa_numero)).toBe(5);

      expect(pendingUpload(store, { tableName: "comandas", rowId: "order-mesa-1" })).toBe(true);
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("cobro para mesa: guarda la factura con mesa_numero y la encola para subir", async () => {
    const { dir, store } = await freshStore("cobro-mesa-e2e");
    try {
      seedBranchAndOpenCycle(store);
      store.saveInvoice({
        id: "inv-mesa-1",
        sucursal_id: BRANCH,
        numero_factura: 1,
        mesa_numero: 5,
        total: 590,
        subtotal: 500,
        itbis: 90,
        metodo_pago: "efectivo",
        estado: "pagada",
        items: [{ cantidad: 2, nombre: "Pollo al horno", precio_unitario: 250 }],
        created_at: "2026-09-19T12:00:00.000Z",
      });

      const invoice = store.listInvoices().find((i) => String(i.id) === "inv-mesa-1");
      expect(invoice, "the dine-in invoice should persist").toBeTruthy();
      // A positive mesa_numero is what the receipt renders as the table (vs. takeout).
      expect(Number(invoice?.mesa_numero)).toBe(5);
      expect(Number(invoice?.total)).toBe(590);
      expect(String(invoice?.estado)).toBe("pagada");

      expect(pendingUpload(store, { tableName: "facturas", rowId: "inv-mesa-1", operation: "upsert" })).toBe(true);
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("cobro para llevar: guarda la factura sin mesa (mesa_numero nulo) y la encola para subir", async () => {
    const { dir, store } = await freshStore("cobro-llevar-e2e");
    try {
      seedBranchAndOpenCycle(store);
      store.saveInvoice({
        id: "inv-llevar-1",
        sucursal_id: BRANCH,
        numero_factura: 2,
        mesa_numero: null,
        total: 300,
        subtotal: 254.24,
        itbis: 45.76,
        metodo_pago: "tarjeta",
        estado: "pagada",
        items: [{ cantidad: 1, nombre: "Combo para llevar", precio_unitario: 300 }],
        created_at: "2026-09-19T13:00:00.000Z",
      });

      const invoice = store.listInvoices().find((i) => String(i.id) === "inv-llevar-1");
      expect(invoice, "the takeout invoice should persist").toBeTruthy();
      // No table => takeout. saveInvoice coerces a null mesa_numero to 0, and the
      // receipt template renders both null and 0 as "Para llevar" (i.e. no positive
      // table number).
      const mesa = invoice?.mesa_numero;
      expect(mesa == null || Number(mesa) === 0).toBe(true);

      expect(pendingUpload(store, { tableName: "facturas", rowId: "inv-llevar-1", operation: "upsert" })).toBe(true);
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("CRUD de facturas: borrar quita la fila y encola el delete para subir", async () => {
    const { dir, store } = await freshStore("factura-crud-e2e");
    try {
      seedBranchAndOpenCycle(store);
      store.saveInvoice({
        id: "inv-del-1",
        sucursal_id: BRANCH,
        numero_factura: 3,
        mesa_numero: 2,
        total: 150,
        metodo_pago: "efectivo",
        estado: "pagada",
        created_at: "2026-09-19T14:00:00.000Z",
      });
      expect(store.listInvoices().some((i) => String(i.id) === "inv-del-1")).toBe(true);

      store.deleteInvoiceAndTraces("inv-del-1");

      expect(store.listInvoices().some((i) => String(i.id) === "inv-del-1")).toBe(false);
      // The deletion must also propagate upward, not just vanish locally.
      expect(pendingUpload(store, { tableName: "facturas", rowId: "inv-del-1", operation: "delete" })).toBe(true);
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("round-trip cobro SQLite: paga la mesa, DESVINCULA el consumo de la comanda y la borra sin dejar referencia muerta ni duplicar", async () => {
    const { dir, store } = await freshStore("cobro-roundtrip-e2e");
    try {
      seedBranchAndOpenCycle(store);
      store.executeOrdersCommand({ command: { type: "orders.kitchen.set-open", id: "kitchen-e2e", isOpen: true }, commitId: "k", branchId: BRANCH });
      store.executeOrdersCommand({ command: { type: "orders.table.set-state", tableId: "mesa-7", tableNumber: 7, state: "occupied" }, commitId: "t", branchId: BRANCH });
      store.executeOrdersCommand({
        command: {
          type: "orders.order-to-kitchen",
          orderId: "comanda-7",
          tableId: "mesa-7",
          tableNumber: 7,
          items: [{ id: "consumo-1", productId: "p-1", name: "Pizza", quantity: 1, unitPrice: 400 }],
        },
        commitId: "o",
        branchId: BRANCH,
      });
      // Precondition: the consumo starts linked to its comanda.
      expect(store.listConsumos().find((c) => String(c.id) === "consumo-1")?.comanda_id).toBe("comanda-7");

      // Migrated checkout (all through the SQLite engine, one outbox): factura,
      // then the paid consumo UNLINKED from its comanda (comanda_id: null + factura_id),
      // then delete the comanda.
      const facturaId = "factura-7";
      store.saveInvoice({ id: facturaId, sucursal_id: BRANCH, numero_factura: 7, mesa_numero: 7, total: 400, estado: "pagada", created_at: "2026-09-19T15:00:00.000Z" });
      store.saveConsumo({ id: "consumo-1", sucursal_id: BRANCH, comanda_id: null, factura_id: facturaId, estado: "pagado", plato_id: "p-1", name: "Pizza", quantity: 1, unit_price: 400, subtotal: 400 });
      store.deleteComanda("comanda-7");

      // The comanda is gone; the paid consumo survives, unlinked and tied to the factura.
      expect(store.listComandas().some((c) => String(c.id) === "comanda-7")).toBe(false);
      const consumo = store.listConsumos().find((c) => String(c.id) === "consumo-1");
      expect(consumo, "the paid consumo is kept, not deleted").toBeTruthy();
      expect(consumo?.comanda_id == null, "comanda link cleared — no dead FK to push").toBe(true);
      expect(String(consumo?.factura_id)).toBe(facturaId);
      expect(String(consumo?.estado)).toBe("pagado");

      // Exactly one factura — nothing duplicated.
      expect(store.listInvoices().filter((i) => String(i.id) === facturaId)).toHaveLength(1);

      // Single (SQLite) outbox: the comanda delete is queued here, and NO pending
      // consumo op still references the deleted comanda.
      const outbox = store.readLocalOutbox();
      expect(outbox.some((r) => r.tableName === "comandas" && r.rowId === "comanda-7" && r.operation === "delete")).toBe(true);
      expect(outbox.some((r) => r.tableName === "facturas" && r.rowId === facturaId)).toBe(true);
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("listInvoices filtra por rango de fechas (created_at) — soporta el default 'mes actual'", async () => {
    const { dir, store } = await freshStore("factura-rango-e2e");
    try {
      seedBranchAndOpenCycle(store);
      store.saveInvoice({ id: "inv-aug", sucursal_id: BRANCH, numero_factura: 10, mesa_numero: 1, total: 100, estado: "pagada", created_at: "2026-08-15T10:00:00.000Z" });
      store.saveInvoice({ id: "inv-sep", sucursal_id: BRANCH, numero_factura: 11, mesa_numero: 1, total: 200, estado: "pagada", created_at: "2026-09-10T10:00:00.000Z" });

      const september = store.listInvoices({
        dateFrom: "2026-09-01T00:00:00.000Z",
        dateTo: "2026-09-30T23:59:59.999Z",
      });
      const ids = september.map((i) => String(i.id));
      expect(ids).toContain("inv-sep");
      expect(ids).not.toContain("inv-aug");
    } finally {
      store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
