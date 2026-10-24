import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudTenantRows } from "../electron/persistence/cloudApply";
import {
  CATALOG_LIST_CHANNEL,
  TENANT_SETTINGS_MERGE_CHANNEL,
  registerCatalogRepositoryIpc,
  type CatalogRepositoryIpcMain,
} from "../electron/persistence/ipc";

describe("Tenant settings write-through merge (SQLite)", () => {
  const tenantId = "tenant-merge";
  let tempDir: string | null = null;
  let store: TenantStore | null = null;

  afterEach(() => {
    store?.close();
    store = null;
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows handle lag. */ }
    }
    tempDir = null;
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-tenant-merge-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    return store;
  }

  const pulled = {
    id: tenantId,
    nombre_negocio: "Salpimentao",
    ncf_b01_secuencia_siguiente: 10,
    itbis_incluido_en_precio: false,
    updated_at: "2026-10-21T10:00:00.000Z",
  };

  it("overlays only the written whitelisted keys and keeps the others", () => {
    const s = setup();
    applyCloudTenantRows(s.getDatabase(), tenantId, [pulled]);
    const merged = s.mergeLocalTenantSettings(tenantId, { ncf_b01_secuencia_siguiente: 25, itbis_incluido_en_precio: true });
    expect(merged).toBe(true);
    expect(s.getLocalTenant()).toMatchObject({
      id: tenantId,
      nombre_negocio: "Salpimentao",
      ncf_b01_secuencia_siguiente: 25,
      itbis_incluido_en_precio: true,
    });
  });

  it("drops keys outside the pull whitelist (secrets and unknown columns)", () => {
    const s = setup();
    applyCloudTenantRows(s.getDatabase(), tenantId, [pulled]);
    s.mergeLocalTenantSettings(tenantId, { ecf_certificate_password: "s3cret", api_token: "tok", rnc: "131" });
    const raw = s.getDatabase().prepare("SELECT settings_json FROM tenants WHERE id = ?").get(tenantId) as { settings_json: string };
    expect(raw.settings_json).not.toContain("s3cret");
    expect(raw.settings_json).not.toContain("api_token");
    expect(s.getLocalTenant()).toMatchObject({ rnc: "131" });
  });

  it("is a no-op when no pulled local row exists", () => {
    const s = setup();
    expect(s.mergeLocalTenantSettings(tenantId, { ncf_b01_secuencia_siguiente: 25 })).toBe(false);
    expect(s.getLocalTenant()).toBeNull();
  });

  it("refuses a tenant id other than the active one", () => {
    const s = setup();
    applyCloudTenantRows(s.getDatabase(), tenantId, [pulled]);
    expect(s.mergeLocalTenantSettings("other-tenant", { nombre_negocio: "Hacked" })).toBe(false);
    expect(s.getLocalTenant()).toMatchObject({ nombre_negocio: "Salpimentao" });
  });

  it("exposes the merge through a trusted-sender IPC channel", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: CatalogRepositoryIpcMain = {
      handle(channel, handler) { handlers.set(channel, handler); },
      removeHandler(channel) { handlers.delete(channel); },
    };
    const calls: Array<[string, Record<string, unknown>]> = [];
    registerCatalogRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({ execute: () => ({ commitId: "x", localStatus: "committed", syncStatus: "pending" }) }),
      mergeTenantSettings: (id, patch) => { calls.push([id, patch]); return true; },
    });
    expect(handlers.has(CATALOG_LIST_CHANNEL)).toBe(true);
    const handler = handlers.get(TENANT_SETTINGS_MERGE_CHANNEL);
    await expect(handler?.({ senderId: 7 }, { tenantId, patch: { rnc: "1" } })).resolves.toEqual({ ok: true, data: { merged: true } });
    await expect(handler?.({ senderId: 9 }, { tenantId, patch: { rnc: "1" } })).rejects.toThrow("Untrusted IPC sender");
    await expect(handler?.({ senderId: 7 }, { tenantId: "", patch: {} })).rejects.toThrow("Invalid tenant settings merge");
    await expect(handler?.({ senderId: 7 }, { tenantId, patch: [] })).rejects.toThrow("Invalid tenant settings merge");
    expect(calls).toEqual([[tenantId, { rnc: "1" }]]);
  });
});
