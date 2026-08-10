import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLegacyImportManifest,
  TenantSQLiteImporter,
  type LegacyImportChunk,
} from "../electron/persistence/importer";
import { TenantStore } from "../electron/persistence/tenantStore";

const tenantId = "tenant-a";

function fixtureChunks(): LegacyImportChunk[] {
  return [
    { table: "platos", rows: [{ id: "dish-1", tenant_id: tenantId, name: "Mofongo" }] },
    {
      table: "sync_outbox",
      rows: [{
        id: "operation-1",
        tenant_id: tenantId,
        status: "syncing",
        syncing_started_at: "2000-01-01T00:00:00.000Z",
        payload: { id: "dish-1" },
      }],
    },
  ];
}

function withDataRoot(run: (dataRoot: string) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-indexeddb-import-"));
  try {
    run(dataRoot);
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* SQLite may retain Windows handles until process exit. */ }
  }
}

describe("IndexedDB to tenant SQLite importer", () => {
  it("imports bounded chunks only when tenant, count, hash, and outbox identities match, resetting stale syncing work", () => {
    withDataRoot((dataRoot) => {
      const chunks = fixtureChunks();
      const importer = new TenantSQLiteImporter({ dataRoot, chunkSize: 1, staleSyncingMs: 60_000 });
      const result = importer.import({ manifest: buildLegacyImportManifest(tenantId, chunks), chunks, nowMs: Date.parse("2000-01-01T00:02:00.000Z") });

      expect(result).toEqual({ tenantId, importedRows: 2, recoveredOutbox: 1 });
      const store = TenantStore.open({ dataRoot, tenantId });
      expect(store.readImportedRows("platos")).toEqual([{ id: "dish-1", tenantId, payload: { id: "dish-1", tenant_id: tenantId, name: "Mofongo" } }]);
      expect(store.readImportedOutbox()).toEqual([{ id: "operation-1", status: "pending" }]);
      store.close();
    });
  });

  it("rejects foreign tenants, malformed manifest hashes, duplicate outbox identities, and dangling outbox dependencies without activation", () => {
    withDataRoot((dataRoot) => {
      const importer = new TenantSQLiteImporter({ dataRoot, chunkSize: 2 });
      const chunks = fixtureChunks();
      const manifest = buildLegacyImportManifest(tenantId, chunks);
      const active = TenantStore.open({ dataRoot, tenantId });
      active.writeFoundationRecord("existing", "must-survive");
      active.close();

      expect(() => importer.import({ manifest: { ...manifest, hash: "bad" }, chunks })).toThrow("manifest hash");
      expect(() => importer.import({ manifest, chunks: [{ table: "platos", rows: [{ id: "dish-1", tenant_id: "tenant-b" }] }] })).toThrow("tenant mismatch");
      expect(() => importer.import({
        manifest: buildLegacyImportManifest(tenantId, [{ table: "sync_outbox", rows: [
          { id: "same", tenant_id: tenantId, status: "pending" },
          { id: "same", tenant_id: tenantId, status: "pending" },
        ] }]),
        chunks: [{ table: "sync_outbox", rows: [
          { id: "same", tenant_id: tenantId, status: "pending" },
          { id: "same", tenant_id: tenantId, status: "pending" },
        ] }],
      })).toThrow("Duplicate outbox identity");
      expect(() => importer.import({
        manifest: buildLegacyImportManifest(tenantId, [{ table: "sync_outbox", rows: [{ id: "dependent", tenant_id: tenantId, status: "pending", depends_on: "missing" }] }]),
        chunks: [{ table: "sync_outbox", rows: [{ id: "dependent", tenant_id: tenantId, status: "pending", depends_on: "missing" }] }],
      })).toThrow("Foreign key check failed");

      const preserved = TenantStore.open({ dataRoot, tenantId });
      expect(preserved.readFoundationRecord("existing")).toEqual({ id: "existing", value: "must-survive" });
      preserved.close();
    });
  });

  it("quarantines interrupted temporary imports, recovers a rollback file, and never partially activates a failed import", () => {
    withDataRoot((dataRoot) => {
      const importer = new TenantSQLiteImporter({ dataRoot, chunkSize: 1 });
      const chunks = fixtureChunks();
      const manifest = buildLegacyImportManifest(tenantId, chunks);
      const first = importer.import({ manifest, chunks });
      expect(first.importedRows).toBe(2);

      writeFileSync(importer.getTemporaryDatabasePath(tenantId), "interrupted");
      expect(() => importer.import({ manifest, chunks, failAfterChunks: 1 })).toThrow("Interrupted import");
      expect(importer.getImportStatus(tenantId)).toEqual({ active: true, recoverable: true });

      const active = TenantStore.open({ dataRoot, tenantId });
      expect(active.readImportedRows("platos")).toHaveLength(1);
      active.close();
    });
  });

  it("restores the prior SQLite store when a crash occurs between rollback and activation renames", () => {
    withDataRoot((dataRoot) => {
      const importer = new TenantSQLiteImporter({ dataRoot });
      const chunks = fixtureChunks();
      importer.import({ manifest: buildLegacyImportManifest(tenantId, chunks), chunks });
      const activePath = join(dataRoot, "tenant-stores", `${tenantId}.sqlite`);
      renameSync(activePath, `${activePath}.rollback`);

      expect(importer.recoverInterruptedActivation(tenantId)).toBe(true);
      const restored = TenantStore.open({ dataRoot, tenantId });
      expect(restored.readImportedRows("platos")).toHaveLength(1);
      restored.close();
    });
  });
});
