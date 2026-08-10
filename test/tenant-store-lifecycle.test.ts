import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TenantStoreController } from "../electron/persistence/tenantStore";
import { buildLegacyImportManifest } from "../electron/persistence/importer";

describe("tenant SQLite lifecycle", () => {
  it("activates only the main-process selected tenant and reports a payload-free status", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-store-controller-"));
    try {
      const controller = new TenantStoreController(dataRoot);

      expect(controller.getStatus()).toEqual({ tenantId: null, isOpen: false });
      controller.activate("tenant-a");
      expect(controller.getStatus()).toEqual({ tenantId: "tenant-a", isOpen: true });
      expect(controller.getActiveStore()?.getTenantId()).toBe("tenant-a");
      controller.close();
      expect(controller.getStatus()).toEqual({ tenantId: null, isOpen: false });
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });

  it("replaces the active handle instead of retaining a prior tenant store", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-store-controller-"));
    try {
      const controller = new TenantStoreController(dataRoot);
      controller.activate("tenant-a");
      controller.activate("tenant-b");

      expect(controller.getStatus()).toEqual({ tenantId: "tenant-b", isOpen: true });
      expect(controller.getActiveStore()?.getTenantId()).toBe("tenant-b");
      controller.close();
    } finally {
      rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  it("closes and reopens the main-process tenant handle around an atomic legacy import", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-store-controller-"));
    try {
      const controller = new TenantStoreController(dataRoot);
      controller.activate("tenant-a");
      const chunks = [{ table: "platos", rows: [{ id: "dish-1", tenant_id: "tenant-a" }] }];

      expect(controller.importLegacySnapshot({ manifest: buildLegacyImportManifest("tenant-a", chunks), chunks })).toEqual({
        tenantId: "tenant-a", importedRows: 1, recoveredOutbox: 0,
      });
      expect(controller.getActiveStore()?.readImportedRows("platos")).toHaveLength(1);
      controller.close();
    } finally {
      rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });
});
