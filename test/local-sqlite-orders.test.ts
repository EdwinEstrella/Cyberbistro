import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OrdersRepository } from "../electron/persistence/ordersRepository";
import { TenantStore } from "../electron/persistence/tenantStore";
import { ORDERS_REPOSITORY_EXECUTE_CHANNEL, registerOrdersRepositoryIpc, type OrdersRepositoryIpcMain } from "../electron/persistence/ipc";

function withStores(run: (stores: { tenantA: TenantStore; tenantB: TenantStore; ordersA: OrdersRepository }) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-orders-"));
  try {
    const tenantA = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    const tenantB = TenantStore.open({ dataRoot, tenantId: "tenant-b" });
    tenantA.executeCatalogCommand({ command: { type: "catalog.branch.upsert", id: "branch-a", name: "A" }, commitId: "seed-a-branch", branchId: "branch-a" });
    tenantA.executeCatalogCommand({ command: { type: "catalog.category.upsert", id: "category-a", name: "Meals" }, commitId: "seed-a-category", branchId: "branch-a" });
    tenantA.executeCatalogCommand({ command: { type: "catalog.product.upsert", id: "product-1", categoryId: "category-a", name: "Burger" }, commitId: "seed-a-product", branchId: "branch-a" });
    tenantB.executeCatalogCommand({ command: { type: "catalog.branch.upsert", id: "branch-b", name: "B" }, commitId: "seed-b-branch", branchId: "branch-b" });
    run({ tenantA, tenantB, ordersA: new OrdersRepository({ store: tenantA, branchId: "branch-a", createCommitId: () => crypto.randomUUID() }) });
    tenantA.close();
    tenantB.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows can retain SQLite handles briefly. */ }
  }
}

describe("tenant-pinned orders, kitchen, and operational cycles", () => {
  it("accepts only typed C2 commands from the trusted renderer", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: OrdersRepositoryIpcMain = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) };
    const executed: unknown[] = [];
    registerOrdersRepositoryIpc({ ipcMain, isTrustedSender: (event) => event.senderId === 7, getRepository: () => ({ execute: (command: unknown) => { executed.push(command); return { commitId: "c2-1", localStatus: "committed", syncStatus: "pending" }; } }) });
    const handler = handlers.get(ORDERS_REPOSITORY_EXECUTE_CHANNEL);

    await expect(handler?.({ senderId: 7 }, { type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-08-09", openingCash: 100 })).resolves.toEqual({ ok: true, data: { commitId: "c2-1", localStatus: "committed", syncStatus: "pending" } });
    await expect(handler?.({ senderId: 7 }, { type: "orders.cycle.open", id: "cycle-2", businessDay: "2026-08-09", openingCash: 100, tenantId: "tenant-b" })).rejects.toThrow("Invalid orders command");
    await expect(handler?.({ senderId: 8 }, { type: "orders.cycle.open", id: "cycle-3", businessDay: "2026-08-09", openingCash: 100 })).rejects.toThrow("Untrusted IPC sender");
    expect(executed).toEqual([{ type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-08-09", openingCash: 100 }]);
  });

  it("keeps table, order, kitchen, and cycle rows isolated between tenant stores", () => {
    withStores(({ tenantA, tenantB, ordersA }) => {
      ordersA.execute({ type: "orders.table.set-state", tableId: "table-1", tableNumber: 1, state: "occupied" });
      ordersA.execute({ type: "orders.cycle.open", id: "cycle-a", businessDay: "2026-08-09", openingCash: 25 });
      tenantB.executeOrdersCommand({ command: { type: "orders.table.set-state", tableId: "table-1", tableNumber: 1, state: "free" }, commitId: "tenant-b-table", branchId: "branch-b" });

      expect(tenantA.readOrderRows("mesas_estado")).toEqual([{ id: "table-1", tableNumber: 1, state: "occupied" }]);
      expect(tenantB.readOrderRows("mesas_estado")).toEqual([{ id: "table-1", tableNumber: 1, state: "free" }]);
      expect(tenantB.readOrderRows("cierres_operativos")).toEqual([]);
    });
  });

  it("enforces FK integrity and atomic order-to-kitchen creation", () => {
    withStores(({ tenantA, ordersA }) => {
      expect(() => ordersA.execute({ type: "orders.order-to-kitchen", orderId: "order-missing", tableId: "missing", tableNumber: 1, items: [{ id: "item-1", productId: "product-1", name: "Burger", quantity: 1, unitPrice: 10 }] })).toThrow();
      expect(tenantA.readOrderRows("comandas")).toEqual([]);
      expect(tenantA.readOrderRows("consumos")).toEqual([]);

      ordersA.execute({ type: "orders.table.set-state", tableId: "table-1", tableNumber: 1, state: "free" });
      ordersA.execute({ type: "orders.kitchen.set-open", id: "kitchen-1", isOpen: true });
      const result = ordersA.execute({ type: "orders.order-to-kitchen", orderId: "order-1", tableId: "table-1", tableNumber: 1, items: [{ id: "item-1", productId: "product-1", name: "Burger", quantity: 2, unitPrice: 10 }] });

      expect(result.localStatus).toBe("committed");
      expect(tenantA.readOrderRows("comandas")).toEqual([{ id: "order-1", tableId: "table-1", tableNumber: 1, state: "pending" }]);
      expect(tenantA.readOrderRows("consumos")).toEqual([{ id: "item-1", orderId: "order-1", quantity: 2, state: "sent_to_kitchen", subtotal: 20 }]);
      expect(tenantA.readOrderRows("mesas_estado")).toEqual([{ id: "table-1", tableNumber: 1, state: "occupied" }]);
      expect(tenantA.readLocalOutbox()).toEqual(expect.arrayContaining([expect.objectContaining({ tableName: "comandas", rowId: "order-1", status: "pending" })]));
    });
  });

  it("rejects invalid state transitions and recovers stale syncing without network probing", () => {
    withStores(({ tenantA, ordersA }) => {
      ordersA.execute({ type: "orders.table.set-state", tableId: "table-1", tableNumber: 1, state: "free" });
      ordersA.execute({ type: "orders.kitchen.set-open", id: "kitchen-1", isOpen: true });
      ordersA.execute({ type: "orders.order-to-kitchen", orderId: "order-1", tableId: "table-1", tableNumber: 1, items: [{ id: "item-1", productId: "product-1", name: "Burger", quantity: 1, unitPrice: 10 }] });
      expect(() => ordersA.execute({ type: "orders.kitchen.advance", orderId: "order-1", nextState: "ready" })).toThrow("Invalid kitchen transition");
      ordersA.execute({ type: "orders.kitchen.advance", orderId: "order-1", nextState: "preparing" });
      ordersA.execute({ type: "orders.kitchen.advance", orderId: "order-1", nextState: "ready" });
      ordersA.execute({ type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-08-09", openingCash: 25 });
      expect(() => ordersA.execute({ type: "orders.cycle.open", id: "cycle-2", businessDay: "2026-08-09", openingCash: 0 })).toThrow("Open cycle already exists");

      tenantA.markOutboxSyncingForRecovery("order-1");
      tenantA.recoverStaleSyncingOperations();
      expect(tenantA.readLocalOutbox().filter((entry) => entry.rowId === "order-1")).toEqual(expect.arrayContaining([expect.objectContaining({ status: "pending" })]));
      expect(tenantA.getNetworkProbeCount()).toBe(0);
    });
  });
});
