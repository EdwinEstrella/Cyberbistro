import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "./schema";

export interface LegacyImportChunk {
  table: string;
  rows: Record<string, unknown>[];
}

export interface LegacyImportManifest {
  tenantId: string;
  tables: Array<{ name: string; count: number; hash: string }>;
  outboxIdsHash: string;
  hash: string;
}

export function buildLegacyImportManifest(tenantId: string, chunks: readonly LegacyImportChunk[]): LegacyImportManifest {
  const rowsByTable = new Map<string, Record<string, unknown>[]>();
  const outboxIds: string[] = [];
  for (const chunk of chunks) {
    const rows = rowsByTable.get(chunk.table) ?? [];
    rows.push(...chunk.rows);
    rowsByTable.set(chunk.table, rows);
    if (chunk.table === "sync_outbox") {
      for (const row of chunk.rows) outboxIds.push(String(row.id ?? ""));
    }
  }
  const tables = [...rowsByTable.entries()].map(([name, rows]) => ({ name, count: rows.length, hash: hashValue(rows) })).sort((a, b) => a.name.localeCompare(b.name));
  const outboxIdsHash = hashValue([...outboxIds].sort());
  return { tenantId, tables, outboxIdsHash, hash: hashValue({ tenantId, tables, outboxIdsHash }) };
}

export class TenantSQLiteImporter {
  private readonly storesDirectory: string;
  private readonly chunkSize: number;
  private readonly staleSyncingMs: number;

  constructor(input: { dataRoot: string; chunkSize?: number; staleSyncingMs?: number }) {
    this.storesDirectory = join(input.dataRoot, "tenant-stores");
    this.chunkSize = input.chunkSize ?? 250;
    this.staleSyncingMs = input.staleSyncingMs ?? 5 * 60 * 1000;
  }

  getTemporaryDatabasePath(tenantId: string): string {
    return join(this.storesDirectory, `${tenantId}.sqlite.tmp`);
  }

  getImportStatus(tenantId: string): { active: boolean; recoverable: boolean } {
    const active = existsSync(this.getActiveDatabasePath(tenantId));
    return { active, recoverable: active || existsSync(this.getRollbackDatabasePath(tenantId)) };
  }

  recoverInterruptedActivation(tenantId: string): boolean {
    validateTenantId(tenantId);
    const activePath = this.getActiveDatabasePath(tenantId);
    const rollbackPath = this.getRollbackDatabasePath(tenantId);
    if (existsSync(activePath) || !existsSync(rollbackPath)) return false;
    renameSync(rollbackPath, activePath);
    return true;
  }

  import(input: { manifest: LegacyImportManifest; chunks: readonly LegacyImportChunk[]; nowMs?: number; failAfterChunks?: number }): { tenantId: string; importedRows: number; recoveredOutbox: number } {
    validateTenantId(input.manifest.tenantId);
    validateChunks(input.manifest, input.chunks, this.chunkSize);
    mkdirSync(this.storesDirectory, { recursive: true, mode: 0o700 });
    chmodSync(this.storesDirectory, 0o700);
    const temporaryPath = this.getTemporaryDatabasePath(input.manifest.tenantId);
    rmSync(temporaryPath, { force: true });

    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(temporaryPath, { enableForeignKeyConstraints: true, defensive: true });
      chmodSync(temporaryPath, 0o600);
      initializeTenantSchema(database, input.manifest.tenantId);
      initializeImportedDataSchema(database);
      database.exec("BEGIN IMMEDIATE;");

      let importedRows = 0;
      let recoveredOutbox = 0;
      for (let chunkIndex = 0; chunkIndex < input.chunks.length; chunkIndex += 1) {
        const chunk = input.chunks[chunkIndex];
        for (const row of chunk.rows) {
          if (chunk.table === "sync_outbox") {
            const status = recoverOutboxStatus(row, input.nowMs ?? Date.now(), this.staleSyncingMs);
            if (status === "pending" && row.status === "syncing") recoveredOutbox += 1;
            database.prepare("INSERT INTO imported_outbox (id, tenant_id, status, depends_on, payload_json) VALUES (?, ?, ?, ?, ?)")
              .run(String(row.id), input.manifest.tenantId, status, typeof row.depends_on === "string" ? row.depends_on : null, stringify(row));
          } else {
            database.prepare("INSERT INTO imported_rows (tenant_id, table_name, row_id, payload_json) VALUES (?, ?, ?, ?)")
              .run(input.manifest.tenantId, chunk.table, String(row.id), stringify(row));
          }
          importedRows += 1;
        }
        if (input.failAfterChunks === chunkIndex + 1) throw new Error("Interrupted import");
      }

      const dangling = database.prepare("SELECT id FROM imported_outbox WHERE depends_on IS NOT NULL AND depends_on NOT IN (SELECT id FROM imported_outbox) LIMIT 1").get();
      if (dangling) throw new Error("Foreign key check failed for outbox dependency");
      database.exec("COMMIT;");
      const integrity = database.prepare("PRAGMA integrity_check;").get() as { integrity_check?: string } | undefined;
      if (integrity?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");
      database.close();
      database = null;
      this.activateTemporaryDatabase(input.manifest.tenantId);
      return { tenantId: input.manifest.tenantId, importedRows, recoveredOutbox };
    } catch (error) {
      try { database?.exec("ROLLBACK;"); } catch { /* No transaction may be open after validation failure. */ }
      database?.close();
      throw error;
    }
  }

  private activateTemporaryDatabase(tenantId: string): void {
    const activePath = this.getActiveDatabasePath(tenantId);
    const rollbackPath = this.getRollbackDatabasePath(tenantId);
    rmSync(rollbackPath, { force: true });
    if (existsSync(activePath)) renameSync(activePath, rollbackPath);
    try {
      renameSync(this.getTemporaryDatabasePath(tenantId), activePath);
    } catch (error) {
      if (existsSync(rollbackPath)) renameSync(rollbackPath, activePath);
      throw error;
    }
  }

  private getActiveDatabasePath(tenantId: string): string {
    return join(this.storesDirectory, `${tenantId}.sqlite`);
  }

  private getRollbackDatabasePath(tenantId: string): string {
    return join(this.storesDirectory, `${tenantId}.sqlite.rollback`);
  }
}

function validateChunks(manifest: LegacyImportManifest, chunks: readonly LegacyImportChunk[], chunkSize: number): void {
  if (manifest.hash !== hashValue({ tenantId: manifest.tenantId, tables: manifest.tables, outboxIdsHash: manifest.outboxIdsHash })) throw new Error("Invalid manifest hash");
  const outboxIds = new Set<string>();
  for (const chunk of chunks) {
    if (!/^[a-z_]{1,64}$/.test(chunk.table) || chunk.rows.length > chunkSize) throw new Error("Invalid bounded import chunk");
    for (const row of chunk.rows) {
      if (!row || typeof row !== "object" || typeof row.id !== "string" || row.id.length === 0) throw new Error("Invalid legacy row identity");
      const rowTenantId = chunk.table === "tenants" ? row.id : row.tenant_id;
      if (rowTenantId !== manifest.tenantId) throw new Error("Legacy row tenant mismatch");
      if (chunk.table === "sync_outbox") {
        if (outboxIds.has(row.id)) throw new Error("Duplicate outbox identity");
        outboxIds.add(row.id);
      }
    }
  }
  const expected = buildLegacyImportManifest(manifest.tenantId, chunks);
  if (stringify(manifest.tables) !== stringify(expected.tables) || manifest.outboxIdsHash !== expected.outboxIdsHash) throw new Error("Manifest count or hash mismatch");
}

function recoverOutboxStatus(row: Record<string, unknown>, nowMs: number, staleSyncingMs: number): string {
  if (row.status !== "syncing") return typeof row.status === "string" ? row.status : "pending";
  const startedAt = typeof row.syncing_started_at === "string" ? Date.parse(row.syncing_started_at) : Number.NaN;
  return Number.isNaN(startedAt) || nowMs - startedAt >= staleSyncingMs ? "pending" : "syncing";
}

function initializeImportedDataSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE imported_rows (tenant_id TEXT NOT NULL, table_name TEXT NOT NULL, row_id TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (table_name, row_id)) STRICT;
    CREATE TABLE imported_outbox (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL, depends_on TEXT, payload_json TEXT NOT NULL) STRICT;
  `);
}

function validateTenantId(tenantId: string): void {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(tenantId)) throw new Error("Invalid tenant identity");
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stringify(value)).digest("hex");
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
