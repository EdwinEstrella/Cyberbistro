import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CatalogRepository } from "../electron/persistence/catalogRepository";
import { TenantStore } from "../electron/persistence/tenantStore";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";

function withStore(run: (store: TenantStore, catalog: CatalogRepository) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-catalog-write-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-test" });
    const catalog = new CatalogRepository({ store, branchId: "branch-test" });
    run(store, catalog);
    store.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows can retain SQLite handles briefly. */ }
  }
}

describe("catalog write path (platos / menu_categories) — SQLite is the single cloud writer", () => {
  it("upserts a full menu_categories row and enqueues an upsert outbox row", () => {
    withStore((store, catalog) => {
      catalog.execute({
        type: "catalog.category.upsert",
        id: "category-1",
        nombre: "Bebidas",
        color: "#ff906d",
        sortOrder: 2,
        sucursalId: "branch-test",
      });

      const row = store.getDatabase().prepare(
        "SELECT id, tenant_id, nombre, color, sort_order, sucursal_id FROM menu_categories WHERE id = ?"
      ).get("category-1");
      expect(row).toEqual({
        id: "category-1",
        tenant_id: "tenant-test",
        nombre: "Bebidas",
        color: "#ff906d",
        sort_order: 2,
        sucursal_id: "branch-test",
      });

      const outbox = store.readLocalOutbox().find((o) => o.tableName === "menu_categories" && o.rowId === "category-1");
      expect(outbox).toMatchObject({ operation: "upsert", status: "pending" });
    });
  });

  it("upserts a full platos row (coercing booleans to SQLite integers) and enqueues an upsert outbox row", () => {
    withStore((store, catalog) => {
      catalog.execute({
        type: "catalog.product.upsert",
        id: "-1758100000123",
        sucursalId: "branch-test",
        nombre: "Hamburguesa",
        precio: 350,
        categoria: "Comidas",
        disponible: true,
        va_a_cocina: true,
      });

      const row = store.getDatabase().prepare(
        "SELECT id, tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina FROM platos WHERE id = ?"
      ).get("-1758100000123");
      expect(row).toEqual({
        id: "-1758100000123",
        tenant_id: "tenant-test",
        sucursal_id: "branch-test",
        nombre: "Hamburguesa",
        precio: 350,
        categoria: "Comidas",
        disponible: 1,
        va_a_cocina: 1,
      });

      const outbox = store.readLocalOutbox().find((o) => o.tableName === "platos" && o.rowId === "-1758100000123");
      expect(outbox).toMatchObject({ operation: "upsert", status: "pending" });

      const payloadRow = store.getDatabase().prepare(
        "SELECT payload_json FROM sync_outbox WHERE row_id = ?"
      ).get("-1758100000123") as { payload_json: string };
      const payload = JSON.parse(payloadRow.payload_json);
      expect(payload).toMatchObject({ disponible: true, va_a_cocina: true, categoria: "Comidas" });
    });
  });

  it("updates an existing plato in place via ON CONFLICT without touching created_at", () => {
    withStore((store, catalog) => {
      catalog.execute({ type: "catalog.product.upsert", id: "p-1", sucursalId: "branch-test", nombre: "Pizza", precio: 500, categoria: "Comidas", disponible: true, va_a_cocina: true });
      const created = store.getDatabase().prepare("SELECT created_at FROM platos WHERE id = 'p-1'").get() as { created_at: string };

      catalog.execute({ type: "catalog.product.upsert", id: "p-1", sucursalId: "branch-test", nombre: "Pizza Grande", precio: 600, categoria: "Comidas", disponible: false, va_a_cocina: true });
      const updated = store.getDatabase().prepare("SELECT nombre, precio, disponible, created_at FROM platos WHERE id = 'p-1'").get() as { nombre: string; precio: number; disponible: number; created_at: string };

      expect(updated).toEqual({ nombre: "Pizza Grande", precio: 600, disponible: 0, created_at: created.created_at });
    });
  });

  it("deletes a plato locally and enqueues a delete outbox row", () => {
    withStore((store, catalog) => {
      catalog.execute({ type: "catalog.product.upsert", id: "p-del", sucursalId: "branch-test", nombre: "Temporal", precio: 100, categoria: "General", disponible: true, va_a_cocina: true });
      catalog.execute({ type: "catalog.product.delete", id: "p-del" });

      expect(store.getDatabase().prepare("SELECT 1 FROM platos WHERE id = 'p-del'").get()).toBeUndefined();

      const deleteRow = store.readLocalOutbox().find((o) => o.tableName === "platos" && o.rowId === "p-del" && o.operation === "delete");
      expect(deleteRow).toMatchObject({ operation: "delete", status: "pending" });
    });
  });

  it("deletes a menu category locally and enqueues a delete outbox row", () => {
    withStore((store, catalog) => {
      catalog.execute({ type: "catalog.category.upsert", id: "cat-del", nombre: "Postres", color: "#abcdef", sortOrder: 3, sucursalId: "branch-test" });
      catalog.execute({ type: "catalog.category.delete", id: "cat-del" });

      expect(store.getDatabase().prepare("SELECT 1 FROM menu_categories WHERE id = 'cat-del'").get()).toBeUndefined();

      const deleteRow = store.readLocalOutbox().find((o) => o.tableName === "menu_categories" && o.rowId === "cat-del" && o.operation === "delete");
      expect(deleteRow).toMatchObject({ operation: "delete", status: "pending" });
    });
  });

  it("claims platos and menu_categories outbox rows for push", () => {
    withStore((store, catalog) => {
      catalog.execute({ type: "catalog.category.upsert", id: "cat-claim", nombre: "Entradas", color: "#111111", sortOrder: 1, sucursalId: "branch-test" });
      catalog.execute({ type: "catalog.product.upsert", id: "p-claim", sucursalId: "branch-test", nombre: "Sopa", precio: 200, categoria: "Entradas", disponible: true, va_a_cocina: true });

      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      const claims = syncStore.claim(Date.now());

      expect(claims.some((c) => c.tableName === "menu_categories" && c.rowId === "cat-claim")).toBe(true);
      expect(claims.some((c) => c.tableName === "platos" && c.rowId === "p-claim")).toBe(true);
    });
  });

  it("pushes a plato upsert to the cloud with a numeric id and boolean flags", async () => {
    withStore(async (store, catalog) => {
      catalog.execute({ type: "catalog.product.upsert", id: "-42", sucursalId: "branch-test", nombre: "Ensalada", precio: 275, categoria: "Saludable", disponible: true, va_a_cocina: false });

      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      const fakeUpsert = vi.fn().mockResolvedValue({ error: null });
      const fakeFrom = vi.fn().mockReturnValue({ upsert: fakeUpsert, delete: vi.fn() });
      const client = new PayrollSyncClient({ from: fakeFrom } as any);

      const claims = syncStore.claim(Date.now());
      const platoClaim = claims.find((c) => c.tableName === "platos" && c.rowId === "-42");
      expect(platoClaim).toBeDefined();

      const pushResult = await client.push(platoClaim!);
      expect(pushResult.permanent).toBeUndefined();

      expect(fakeFrom).toHaveBeenCalledWith("platos");
      expect(fakeUpsert).toHaveBeenCalledWith(
        {
          id: -42,
          tenant_id: "tenant-test",
          sucursal_id: "branch-test",
          nombre: "Ensalada",
          precio: 275,
          categoria: "Saludable",
          disponible: true,
          va_a_cocina: false,
        },
        { onConflict: "id" }
      );
      expect(typeof fakeUpsert.mock.calls[0][0].id).toBe("number");
    });
  });

  it("pushes a menu_categories upsert to the cloud keeping the uuid id as a string", async () => {
    withStore(async (store, catalog) => {
      catalog.execute({ type: "catalog.category.upsert", id: "cat-push", nombre: "Postres", color: "#ff906d", sortOrder: 4, sucursalId: "branch-test" });

      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      const fakeUpsert = vi.fn().mockResolvedValue({ error: null });
      const fakeFrom = vi.fn().mockReturnValue({ upsert: fakeUpsert, delete: vi.fn() });
      const client = new PayrollSyncClient({ from: fakeFrom } as any);

      const claims = syncStore.claim(Date.now());
      const categoryClaim = claims.find((c) => c.tableName === "menu_categories" && c.rowId === "cat-push");
      expect(categoryClaim).toBeDefined();

      await client.push(categoryClaim!);

      expect(fakeFrom).toHaveBeenCalledWith("menu_categories");
      expect(fakeUpsert).toHaveBeenCalledWith(
        {
          id: "cat-push",
          tenant_id: "tenant-test",
          nombre: "Postres",
          color: "#ff906d",
          sort_order: 4,
          sucursal_id: "branch-test",
        },
        { onConflict: "id" }
      );
    });
  });

  it("pushes a plato delete as a cloud delete", async () => {
    withStore(async (store, catalog) => {
      catalog.execute({ type: "catalog.product.upsert", id: "p-del-push", sucursalId: "branch-test", nombre: "Temporal", precio: 100, categoria: "General", disponible: true, va_a_cocina: true });
      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      // Drain the upsert outbox row first so only the delete remains to claim.
      for (const op of syncStore.claim(Date.now())) syncStore.settle(op.id, "synced", {});

      catalog.execute({ type: "catalog.product.delete", id: "p-del-push" });

      const fakeDeleteEq = vi.fn().mockResolvedValue({ error: null });
      const fakeFrom = vi.fn().mockReturnValue({ upsert: vi.fn(), delete: vi.fn().mockReturnValue({ eq: fakeDeleteEq }) });
      const client = new PayrollSyncClient({ from: fakeFrom } as any);

      const claims = syncStore.claim(Date.now());
      const deleteClaim = claims.find((c) => c.tableName === "platos" && c.op === "delete");
      expect(deleteClaim).toBeDefined();

      const pushResult = await client.push(deleteClaim!);
      expect(pushResult.permanent).toBeUndefined();

      expect(fakeFrom).toHaveBeenCalledWith("platos");
      expect(fakeDeleteEq).toHaveBeenCalledWith("id", "p-del-push");
    });
  });

  it("pushes a menu_categories delete as a cloud delete", async () => {
    withStore(async (store, catalog) => {
      catalog.execute({ type: "catalog.category.upsert", id: "cat-del-push", nombre: "Temp", color: "#000000", sortOrder: 0, sucursalId: "branch-test" });
      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      for (const op of syncStore.claim(Date.now())) syncStore.settle(op.id, "synced", {});

      catalog.execute({ type: "catalog.category.delete", id: "cat-del-push" });

      const fakeDeleteEq = vi.fn().mockResolvedValue({ error: null });
      const fakeFrom = vi.fn().mockReturnValue({ upsert: vi.fn(), delete: vi.fn().mockReturnValue({ eq: fakeDeleteEq }) });
      const client = new PayrollSyncClient({ from: fakeFrom } as any);

      const claims = syncStore.claim(Date.now());
      const deleteClaim = claims.find((c) => c.tableName === "menu_categories" && c.op === "delete");
      expect(deleteClaim).toBeDefined();

      await client.push(deleteClaim!);

      expect(fakeFrom).toHaveBeenCalledWith("menu_categories");
      expect(fakeDeleteEq).toHaveBeenCalledWith("id", "cat-del-push");
    });
  });
});
