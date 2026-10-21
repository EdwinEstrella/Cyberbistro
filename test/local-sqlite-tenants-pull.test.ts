import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudTenantRows, pickLocalTenantSettings } from "../electron/persistence/cloudApply";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { SYNC_PULL_TABLES } from "../electron/persistence/syncPullRegistry";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";

describe("Tenants cloud→SQLite pull", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;
  const tenantId = "tenant-ten";

  afterEach(() => {
    store?.close();
    store = null;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-tenant-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    return store;
  }

  const cloud = (over: Record<string, unknown> = {}) => ({
    id: tenantId,
    nombre_negocio: "Salpimentao",
    rnc: "131000001",
    direccion: "Calle 1",
    telefono: "809-555-0000",
    moneda: "DOP",
    fiscal_mode: "ncf_legacy",
    ncf_fiscal_activo: true,
    ncf_tipo_default: "B02",
    ncf_tipos_activos: { B01: true, B02: true },
    ncf_secuencias_por_tipo: { B01: 10, B02: 250 },
    ncf_b01_secuencia_siguiente: 10,
    ncf_b02_secuencia_siguiente: 250,
    itbis_cobro_por_defecto: true,
    updated_at: "2026-10-21T10:00:00.000Z",
    // Secrets / custody metadata that must never be stored locally.
    ecf_certificate_password: "s3cret",
    api_token: "tok",
    ...over,
  });

  it("is registered for pull scoped by id and never deleted", () => {
    const entry = SYNC_PULL_TABLES.find((t) => t.localTable === "tenants");
    expect(entry).toMatchObject({ remoteTable: "tenants", deletable: false, scopeColumn: "id" });
    expect(SYNC_PULL_TABLES[0].localTable).toBe("sucursales");
  });

  it("returns null before the first pull", () => {
    expect(setup().getLocalTenant()).toBeNull();
  });

  it("stores only whitelisted settings and exposes them through listCatalog", () => {
    const s = setup();
    applyCloudTenantRows(s.getDatabase(), tenantId, [cloud()]);
    const tenant = s.listCatalog().tenant;
    expect(tenant).toMatchObject({
      id: tenantId,
      nombre_negocio: "Salpimentao",
      ncf_fiscal_activo: true,
      ncf_tipo_default: "B02",
      ncf_secuencias_por_tipo: { B01: 10, B02: 250 },
      ncf_b02_secuencia_siguiente: 250,
    });
    expect(tenant).not.toHaveProperty("ecf_certificate_password");
    expect(tenant).not.toHaveProperty("api_token");
    const raw = s.getDatabase().prepare("SELECT settings_json FROM tenants WHERE id = ?").get(tenantId) as { settings_json: string };
    expect(raw.settings_json).not.toContain("s3cret");
  });

  it("ignores rows of another tenant and replaces the snapshot on a later pull", () => {
    const s = setup();
    const db = s.getDatabase();
    applyCloudTenantRows(db, tenantId, [cloud({ id: "other", nombre_negocio: "Ajeno" })]);
    expect(s.getLocalTenant()).toBeNull();
    applyCloudTenantRows(db, tenantId, [cloud()]);
    applyCloudTenantRows(db, tenantId, [cloud({ nombre_negocio: "Nuevo", ncf_b02_secuencia_siguiente: 300 })]);
    expect(s.getLocalTenant()).toMatchObject({ nombre_negocio: "Nuevo", ncf_b02_secuencia_siguiente: 300 });
  });

  it("pickLocalTenantSettings keeps nulls but drops unknown columns", () => {
    expect(pickLocalTenantSettings({ rnc: null, secret: "x" })).toEqual({ rnc: null });
  });

  it("migrates a legacy id-only tenants table idempotently", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE tenant_identity (id TEXT PRIMARY KEY) STRICT; INSERT INTO tenant_identity VALUES ('" + tenantId + "'); CREATE TABLE tenants (id TEXT PRIMARY KEY REFERENCES tenant_identity(id)) STRICT; INSERT INTO tenants VALUES ('" + tenantId + "');");
    initializeTenantSchema(db, tenantId);
    initializeTenantSchema(db, tenantId);
    const cols = (db.prepare("PRAGMA table_info(tenants)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["settings_json", "cloud_synced", "cloud_updated_at"]));
    expect(db.prepare("SELECT cloud_synced FROM tenants WHERE id = ?").get(tenantId)).toMatchObject({ cloud_synced: 0 });
    db.close();
  });

  it("pull client scopes the tenants table by id and checks the row id", async () => {
    const eqCalls: Array<[string, string, string]> = [];
    const makeQuery = (table: string) => {
      let served = false;
      const query: any = {
        select: () => query,
        eq: (column: string, value: string) => { eqCalls.push([table, column, value]); return query; },
        order: () => query,
        limit: () => query,
        gt: () => { served = true; return query; },
        gte: () => query,
        then: (resolve: (v: unknown) => void) => {
          const data = table === "tenants" && !served ? [cloud()] : [];
          served = true;
          resolve({ data, error: null });
        },
      };
      return query;
    };
    const client = new PayrollSyncClient({ from: makeQuery } as any);
    const batch = await client.pull({ tenantId, cursor: null });
    expect(eqCalls).toContainEqual(["tenants", "id", tenantId]);
    expect(eqCalls).toContainEqual(["sucursales", "tenant_id", tenantId]);
    expect(batch.changes.filter((c) => c.tableName === "tenants")).toHaveLength(1);
    expect(batch.failedTables ?? []).toEqual([]);
  });
});
