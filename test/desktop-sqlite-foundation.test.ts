import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";

describe("tenant SQLite foundation", () => {
  it("opens one user-scoped, tenant-pinned database with WAL and foreign keys", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-sqlite-"));
    try {
      const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });

      expect(store.getJournalMode()).toBe("wal");
      expect(store.hasForeignKeysEnabled()).toBe(true);
      expect(store.getTenantId()).toBe("tenant-a");
      if (process.platform !== "win32") expect(statSync(store.getDatabasePath()).mode & 0o077).toBe(0);
      store.close();
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });

  it("keeps each store pinned to its own tenant without accepting a caller-supplied tenant selector", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-sqlite-"));
    try {
      const tenantA = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
      const tenantB = TenantStore.open({ dataRoot, tenantId: "tenant-b" });

      tenantA.writeFoundationRecord("record-a", "A");
      tenantB.writeFoundationRecord("record-b", "B");

      expect(tenantA.readFoundationRecord("record-a")).toEqual({ id: "record-a", value: "A" });
      expect(tenantA.readFoundationRecord("record-b")).toBeNull();
      expect(tenantB.readFoundationRecord("record-a")).toBeNull();
      tenantA.close();
      tenantB.close();
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });
});
