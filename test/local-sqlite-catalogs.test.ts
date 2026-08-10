import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CatalogRepository } from "../electron/persistence/catalogRepository";
import { TenantStore } from "../electron/persistence/tenantStore";
import { CATALOG_REPOSITORY_EXECUTE_CHANNEL, registerCatalogRepositoryIpc, type CatalogRepositoryIpcMain } from "../electron/persistence/ipc";

function withStores(run: (stores: { tenantA: TenantStore; tenantB: TenantStore; catalogA: CatalogRepository }) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-catalogs-"));
  try {
    const tenantA = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    const tenantB = TenantStore.open({ dataRoot, tenantId: "tenant-b" });
    run({ tenantA, tenantB, catalogA: new CatalogRepository({ store: tenantA, branchId: "branch-a" }) });
    tenantA.close();
    tenantB.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows can retain SQLite handles briefly. */ }
  }
}

describe("tenant-pinned catalog SQLite", () => {
  it("accepts only typed catalog commands from the trusted renderer", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: CatalogRepositoryIpcMain = {
      handle(channel, handler) { handlers.set(channel, handler); },
      removeHandler(channel) { handlers.delete(channel); },
    };
    const executed: unknown[] = [];
    registerCatalogRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({ execute: (command: unknown) => { executed.push(command); return { commitId: "catalog-1", localStatus: "committed", syncStatus: "pending" }; } }),
    });
    const handler = handlers.get(CATALOG_REPOSITORY_EXECUTE_CHANNEL);

    await expect(handler?.({ senderId: 7 }, { type: "catalog.customer.upsert", id: "customer-1", name: "Alice" })).resolves.toEqual({ ok: true, data: { commitId: "catalog-1", localStatus: "committed", syncStatus: "pending" } });
    await expect(handler?.({ senderId: 7 }, { type: "catalog.customer.upsert", tenantId: "tenant-b", id: "customer-2", name: "Mallory" })).rejects.toThrow("Invalid catalog command");
    await expect(handler?.({ senderId: 9 }, { type: "catalog.customer.upsert", id: "customer-3", name: "Mallory" })).rejects.toThrow("Untrusted IPC sender");
    expect(executed).toEqual([{ type: "catalog.customer.upsert", id: "customer-1", name: "Alice" }]);
  });

  it("keeps catalog rows isolated between tenant stores", () => {
    withStores(({ tenantA, tenantB, catalogA }) => {
      catalogA.execute({ type: "catalog.customer.upsert", id: "customer-a", name: "Alice" });
      tenantB.executeCatalogCommand({ command: { type: "catalog.customer.upsert", id: "customer-b", name: "Bob" }, commitId: "tenant-b-commit", branchId: "branch-b" });

      expect(tenantA.readCatalogRows("customers")).toEqual([{ id: "customer-a", name: "Alice" }]);
      expect(tenantB.readCatalogRows("customers")).toEqual([{ id: "customer-b", name: "Bob" }]);
    });
  });

  it("enforces catalog primary keys and foreign keys", () => {
    withStores(({ tenantA, catalogA }) => {
      expect(() => catalogA.execute({ type: "catalog.recipe.upsert", id: "recipe-1", platoId: "missing-plato", inventoryProductId: "missing-stock", quantity: 1 })).toThrow();
      expect(tenantA.readCatalogRows("recetas")).toEqual([]);

      catalogA.execute({ type: "catalog.category.upsert", id: "category-1", name: "Meals" });
      catalogA.execute({ type: "catalog.product.upsert", id: "product-1", name: "Burger", categoryId: "category-1" });
      catalogA.execute({ type: "catalog.inventory-product.upsert", id: "stock-1", name: "Beef", unit: "kg" });
      catalogA.execute({ type: "catalog.recipe.upsert", id: "recipe-1", platoId: "product-1", inventoryProductId: "stock-1", quantity: 0.25 });

      catalogA.execute({ type: "catalog.product.upsert", id: "product-1", name: "Updated Burger", categoryId: "category-1" });
      expect(tenantA.readCatalogRows("platos")).toEqual([{ id: "product-1", name: "Updated Burger", categoryId: "category-1" }]);
      expect(tenantA.readCatalogRows("recetas")).toEqual([{ id: "recipe-1", platoId: "product-1", inventoryProductId: "stock-1", quantity: 0.25 }]);
    });
  });

  it("commits catalog CRUD and its pending outbox operation atomically", () => {
    withStores(({ tenantA, catalogA }) => {
      const result = catalogA.execute({ type: "catalog.supplier.upsert", id: "supplier-1", name: "Farm Co" });

      expect(result.localStatus).toBe("committed");
      expect(tenantA.readCatalogRows("proveedores")).toEqual([{ id: "supplier-1", name: "Farm Co" }]);
      expect(tenantA.readLocalOutbox()).toEqual([expect.objectContaining({ tableName: "proveedores", rowId: "supplier-1", status: "pending" })]);
    });
  });

  it("rolls back the catalog mutation when its outbox operation conflicts", () => {
    withStores(({ tenantA }) => {
      const catalog = new CatalogRepository({ store: tenantA, branchId: "branch-a", createCommitId: () => "duplicate-commit" });
      catalog.execute({ type: "catalog.branch.upsert", id: "branch-1", name: "Main" });

      expect(() => catalog.execute({ type: "catalog.branch.upsert", id: "branch-2", name: "Second" })).toThrow();
      expect(tenantA.readCatalogRows("sucursales")).toEqual([{ id: "branch-1", name: "Main" }]);
      expect(tenantA.readLocalOutbox()).toHaveLength(1);
    });
  });
});
