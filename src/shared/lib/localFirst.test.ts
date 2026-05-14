import { describe, expect, it } from "vitest";
import {
  buildSyncStateKey,
  createSyncOutboxEntry,
  createSyncStateRow,
  getHistoricalSyncIncompleteMessage,
  isLocalFirstEnabled,
  isLicenseValidOffline,
  isLocalFirstMirrorTable,
  LOCAL_FIRST_IMMEDIATE_TABLES,
  LOCAL_FIRST_MIRROR_TABLES,
  LOCAL_FIRST_METADATA_TABLES,
  resolveConflictForTable,
  shouldReadLocalFirst,
  type LocalLicenseCache,
  type SyncOutboxEntry,
} from "./localFirst";

describe("localFirst", () => {
  it("mantiene tablas mirror y metadata sin inventar entidades de negocio", () => {
    expect(LOCAL_FIRST_MIRROR_TABLES).toContain("comandas");
    expect(LOCAL_FIRST_MIRROR_TABLES).toContain("facturas");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("orders");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("invoices");
    expect(LOCAL_FIRST_METADATA_TABLES).toContain("sync_outbox");
  });

  it("incluye el dataset mínimo operativo antes del historial background", () => {
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).toEqual(
      expect.arrayContaining(["tenants", "tenant_users", "configuracion", "platos", "mesas_estado", "cocina_estado"])
    );
  });

  it("genera cursores por tenant, fase y tabla", () => {
    expect(buildSyncStateKey("tenant-1", "facturas", "history")).toBe("tenant-1:history:facturas");
    expect(createSyncStateRow({ tenantId: "tenant-1", tableName: "facturas", phase: "history", completed: true, rowCount: 7 })).toMatchObject({
      key: "tenant-1:history:facturas",
      tenant_id: "tenant-1",
      table_name: "facturas",
      completed: true,
      row_count: 7,
    });
  });

  it("registra deletes como eventos auditables en sync_outbox", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "factura-1",
      op: "delete",
      authUserId: "auth-1",
      deviceId: "device-1",
    });

    expect(entry).toMatchObject({
      tenant_id: "tenant-1",
      table_name: "facturas",
      row_id: "factura-1",
      op: "delete",
      status: "pending",
      created_by_auth_user_id: "auth-1",
      device_id: "device-1",
    });
  });

  it("expone mensaje cuando una consulta histórica aún puede estar incompleta", () => {
    expect(getHistoricalSyncIncompleteMessage("ready_history_syncing")).toContain("historial antiguo");
    expect(getHistoricalSyncIncompleteMessage("history_complete")).toBeNull();
    expect(isLocalFirstMirrorTable("consumos")).toBe(true);
    expect(isLocalFirstMirrorTable("orders")).toBe(false);
  });

  it("desactiva local-first fuera de Electron para que la web lea siempre servidor", async () => {
    expect(isLocalFirstEnabled()).toBe(false);
    await expect(shouldReadLocalFirst("tenant-1", ["cierres_operativos"])).resolves.toBe(false);
  });

  it("valida licencia offline con ventana de 6 horas", () => {
    const validCache: LocalLicenseCache = {
      tenant_id: "tenant-1",
      tenant_activa: true,
      tenant_users_activo: true,
      validated_at: new Date().toISOString(),
      window_valid_until: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    };
    expect(isLicenseValidOffline(validCache)).toBe(true);

    const expiredCache: LocalLicenseCache = {
      ...validCache,
      window_valid_until: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isLicenseValidOffline(expiredCache)).toBe(false);

    expect(isLicenseValidOffline(null)).toBe(false);

    const inactiveTenantCache: LocalLicenseCache = { ...validCache, tenant_activa: false };
    expect(isLicenseValidOffline(inactiveTenantCache)).toBe(false);

    const inactiveUserCache: LocalLicenseCache = { ...validCache, tenant_users_activo: false };
    expect(isLicenseValidOffline(inactiveUserCache)).toBe(false);
  });

  it("resuelve conflictos de facturas sin sobrescribir silenciosamente", () => {
    const serverRowNewer = { id: "f1", updated_at: new Date().toISOString() };

    const entryUpdateOld: SyncOutboxEntry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f1",
      op: "update",
      payload: { updated_at: new Date(Date.now() - 10000).toISOString() },
      deviceId: "dev1",
    });
    const result1 = resolveConflictForTable("facturas", entryUpdateOld, serverRowNewer);
    expect(result1.resolution).toBe("server_wins");

    const entryUpdateNew = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f1",
      op: "update",
      payload: { updated_at: new Date().toISOString() },
      deviceId: "dev1",
    });
    const result2 = resolveConflictForTable("facturas", entryUpdateNew, serverRowNewer);
    expect(result2.resolution).toBe("local_wins");

    const entryDelete = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f1",
      op: "delete",
      deviceId: "dev1",
    });
    const result3 = resolveConflictForTable("facturas", entryDelete, serverRowNewer);
    expect(result3.resolution).toBe("skip");
    expect(result3.reason).toContain("audit");
  });

  it("cierres operativos no se duplican en servidor", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "cierres_operativos",
      rowId: "c1",
      op: "insert",
      payload: { cycle_number: 5 },
      deviceId: "dev1",
    });
    const existingCycle = { id: "c1", cycle_number: 5 };
    const result = resolveConflictForTable("cierres_operativos", entry, existingCycle);
    expect(result.resolution).toBe("server_wins");
    expect(result.reason).toContain("ya existe");
  });

  it("identidades siempre ganan del servidor", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenant_users",
      rowId: "u1",
      op: "update",
      payload: { activo: false },
      deviceId: "dev1",
    });
    const result = resolveConflictForTable("tenant_users", entry, { id: "u1" });
    expect(result.resolution).toBe("server_wins");
  });
});
