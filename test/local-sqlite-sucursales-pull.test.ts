import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudSucursalRows } from "../electron/persistence/cloudApply";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { SYNC_PULL_TABLES } from "../electron/persistence/syncPullRegistry";

describe("Sucursales cloud→SQLite pull", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;
  const tenantId = "tenant-suc";

  afterEach(() => {
    store?.close();
    store = null;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-suc-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    return store;
  }

  const cloud = (over: Record<string, unknown> = {}) => ({
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: tenantId,
    nombre: "Sede Centro",
    direccion: "Calle 1",
    telefono: "809-555-0000",
    activa: true,
    ...over,
  });

  it("is registered for pull ahead of every table that references it", () => {
    const order = SYNC_PULL_TABLES.map((t) => t.localTable);
    expect(order[0]).toBe("sucursales");
    expect(SYNC_PULL_TABLES[0].deletable).toBe(false);
  });

  it("hides seeded placeholders until the cloud row arrives", () => {
    const s = setup();
    const db = s.getDatabase();
    db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, 'Principal')").run("main-process-default", tenantId);
    expect(s.listSucursales()).toEqual([]);
  });

  it("overwrites the placeholder of the same id with the real cloud branch", () => {
    const s = setup();
    const db = s.getDatabase();
    const id = cloud().id;
    db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, 'Principal')").run(id, tenantId);

    applyCloudSucursalRows(db, tenantId, [cloud()]);

    expect(s.listSucursales()).toEqual([
      { id, tenant_id: tenantId, nombre: "Sede Centro", direccion: "Calle 1", telefono: "809-555-0000", activa: true },
    ]);
  });

  it("maps inactive branches and nulls, and un-flags branches missing from a later snapshot", () => {
    const s = setup();
    const db = s.getDatabase();
    const other = "22222222-2222-4222-8222-222222222222";
    applyCloudSucursalRows(db, tenantId, [cloud(), cloud({ id: other, nombre: "Sede Norte", direccion: null, telefono: null, activa: false })]);
    const rows = s.listSucursales();
    expect(rows.find((r) => r.id === other)).toMatchObject({ nombre: "Sede Norte", direccion: null, activa: false });

    applyCloudSucursalRows(db, tenantId, [cloud()]);
    expect(s.listSucursales().map((r) => r.id)).toEqual([cloud().id]);
    // Not deleted: other tables may reference it.
    expect(db.prepare("SELECT id FROM sucursales WHERE id = ?").get(other)).toBeDefined();
  });

  it("exposes branches through listCatalog", () => {
    const s = setup();
    applyCloudSucursalRows(s.getDatabase(), tenantId, [cloud()]);
    expect(s.listCatalog().sucursales).toHaveLength(1);
  });

  it("migrates a legacy id/name sucursales table idempotently", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE sucursales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL) STRICT; INSERT INTO sucursales VALUES ('old', 't', 'Principal');");
    initializeTenantSchema(db, tenantId);
    // Re-running must not fail on already-added columns.
    initializeTenantSchema(db, tenantId);
    const cols = (db.prepare("PRAGMA table_info(sucursales)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["direccion", "telefono", "activa", "cloud_synced"]));
    expect(db.prepare("SELECT activa, cloud_synced FROM sucursales WHERE id = 'old'").get()).toMatchObject({ activa: 1, cloud_synced: 0 });
    db.close();
  });
});
