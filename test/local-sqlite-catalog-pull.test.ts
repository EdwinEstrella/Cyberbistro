import { afterEach, describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudPlatoRows, applyCloudMenuCategoryRows, applyCloudDeletes } from "../electron/persistence/cloudApply";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Catálogo (platos/menu_categories) cloud→SQLite pull", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;
  const tenantId = "tenant-catalog";

  afterEach(() => {
    if (store) {
      store.close();
      store = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-catalog-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    return store;
  }

  const cloudCategory = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "cat-uuid-1",
    tenant_id: tenantId,
    nombre: "Bebidas",
    color: "#ff906d",
    sort_order: 1,
    sucursal_id: "branch-1",
    ...over,
  });

  const cloudPlato = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 42,
    tenant_id: tenantId,
    sucursal_id: "branch-1",
    nombre: "Coca-Cola",
    precio: 75,
    categoria: "Bebidas",
    disponible: true,
    va_a_cocina: false,
    ...over,
  });

  it("lands a cloud menu category in SQLite with the full shape", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudMenuCategoryRows(db, tenantId, [cloudCategory()]);

    const row = db.prepare("SELECT * FROM menu_categories WHERE id = 'cat-uuid-1'").get() as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.tenant_id).toBe(tenantId);
    expect(row.nombre).toBe("Bebidas");
    expect(row.color).toBe("#ff906d");
    expect(row.sort_order).toBe(1);
    expect(row.sucursal_id).toBe("branch-1");
  });

  it("lands a cloud plato in SQLite, coercing the integer id and boolean flags", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudPlatoRows(db, tenantId, [cloudPlato()]);

    const row = db.prepare("SELECT * FROM platos WHERE id = '42'").get() as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.tenant_id).toBe(tenantId);
    expect(row.sucursal_id).toBe("branch-1");
    expect(row.nombre).toBe("Coca-Cola");
    expect(row.precio).toBe(75);
    expect(row.categoria).toBe("Bebidas");
    expect(row.disponible).toBe(1);
    expect(row.va_a_cocina).toBe(0);
  });

  it("accepts a negative client-assigned temp id for a plato", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudPlatoRows(db, tenantId, [cloudPlato({ id: -1700000000123 })]);

    const row = db.prepare("SELECT id FROM platos WHERE nombre = 'Coca-Cola'").get() as Record<string, unknown>;
    expect(row.id).toBe("-1700000000123");
  });

  it("is idempotent and updates on re-pull (no duplicates)", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudPlatoRows(db, tenantId, [cloudPlato()]);
    applyCloudPlatoRows(db, tenantId, [cloudPlato({ precio: 90, disponible: false })]);

    const rows = db.prepare("SELECT * FROM platos WHERE id = '42'").all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].precio).toBe(90);
    expect(rows[0].disponible).toBe(0);
  });

  it("skips a plato row with a pending local write instead of clobbering it", () => {
    const s = setup();
    const db = s.getDatabase();

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES ('outbox-plato-1', ?, 'branch-1', 'platos', '42', 'upsert', '{}', 'pending')
    `).run(tenantId);

    applyCloudPlatoRows(db, tenantId, [cloudPlato()]);

    const row = db.prepare("SELECT * FROM platos WHERE id = '42'").get();
    expect(row).toBeUndefined();
  });

  it("skips a menu_categories row with a pending local write instead of clobbering it", () => {
    const s = setup();
    const db = s.getDatabase();

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES ('outbox-cat-1', ?, 'branch-1', 'menu_categories', 'cat-uuid-1', 'upsert', '{}', 'pending')
    `).run(tenantId);

    applyCloudMenuCategoryRows(db, tenantId, [cloudCategory()]);

    const row = db.prepare("SELECT * FROM menu_categories WHERE id = 'cat-uuid-1'").get();
    expect(row).toBeUndefined();
  });

  it("deletes a plato via applyCloudDeletes", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudPlatoRows(db, tenantId, [cloudPlato()]);
    expect(db.prepare("SELECT id FROM platos WHERE id = '42'").get()).toBeTruthy();

    const complete = applyCloudDeletes(db, "platos", ["42"], tenantId);

    expect(complete).toBe(true);
    expect(db.prepare("SELECT id FROM platos WHERE id = '42'").get()).toBeUndefined();
  });

  it("deletes a menu category via applyCloudDeletes", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudMenuCategoryRows(db, tenantId, [cloudCategory()]);
    expect(db.prepare("SELECT id FROM menu_categories WHERE id = 'cat-uuid-1'").get()).toBeTruthy();

    const complete = applyCloudDeletes(db, "menu_categories", ["cat-uuid-1"], tenantId);

    expect(complete).toBe(true);
    expect(db.prepare("SELECT id FROM menu_categories WHERE id = 'cat-uuid-1'").get()).toBeUndefined();
  });

  it("exposes pulled platos and menu categories through listCatalog", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudMenuCategoryRows(db, tenantId, [cloudCategory()]);
    applyCloudPlatoRows(db, tenantId, [cloudPlato()]);

    const catalog = s.listCatalog();
    expect(catalog.platos).toHaveLength(1);
    expect(catalog.platos[0].nombre).toBe("Coca-Cola");
    expect(catalog.menuCategories).toHaveLength(1);
    expect(catalog.menuCategories[0].nombre).toBe("Bebidas");
  });
});
