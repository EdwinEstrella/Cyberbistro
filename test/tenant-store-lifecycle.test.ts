import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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

  it("re-activating the already-open tenant keeps the same handle and does not restart sync", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-store-controller-"));
    try {
      const controller = new TenantStoreController(dataRoot);
      const start = vi.spyOn(controller.payrollSync, "start").mockImplementation(() => undefined);
      vi.spyOn(controller.payrollSync, "isRunning").mockReturnValue(true);

      const first = controller.activate("tenant-a");
      const second = controller.activate("tenant-a");

      expect(second).toBe(first);
      expect(start).toHaveBeenCalledTimes(1);

      controller.activate("tenant-b");
      expect(start).toHaveBeenCalledTimes(2);
      expect(controller.getActiveStore()?.getTenantId()).toBe("tenant-b");
      controller.close();
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
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
