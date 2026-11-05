import type { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";

export interface DanglingForeignKey {
  table: string;
  column: string;
  parent: string;
  parentColumn: string | null;
  reason: "missing_table" | "missing_column";
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
}

export function findDanglingForeignKeys(db: DatabaseSync): DanglingForeignKey[] {
  const userTables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);

  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  const tableColumnsCache = new Map<string, Set<string>>();
  const getParentColumns = (tableName: string): Set<string> => {
    let cols = tableColumnsCache.get(tableName);
    if (!cols) {
      const rows = db.prepare("SELECT name FROM pragma_table_info(?)").all(tableName) as Array<{ name: string }>;
      cols = new Set(rows.map((r) => r.name));
      tableColumnsCache.set(tableName, cols);
    }
    return cols;
  };

  const dangling: DanglingForeignKey[] = [];

  for (const tableName of userTables) {
    const fks = db.prepare("SELECT * FROM pragma_foreign_key_list(?)").all(tableName) as unknown as ForeignKeyRow[];

    for (const fk of fks) {
      if (!existingTables.has(fk.table)) {
        dangling.push({
          table: tableName,
          column: fk.from,
          parent: fk.table,
          parentColumn: fk.to,
          reason: "missing_table",
        });
      } else if (fk.to !== null) {
        const parentCols = getParentColumns(fk.table);
        if (!parentCols.has(fk.to)) {
          dangling.push({
            table: tableName,
            column: fk.from,
            parent: fk.table,
            parentColumn: fk.to,
            reason: "missing_column",
          });
        }
      }
    }
  }

  return dangling;
}

export function findLeftoverMigrationArtifacts(db: DatabaseSync): string[] {
  const artifacts = new Set<string>();

  const rows = db.prepare("SELECT name, type, sql FROM sqlite_master").all() as Array<{
    name: string;
    type: string;
    sql: string | null;
  }>;

  for (const row of rows) {
    if (row.name.includes("__legacy_migration") || row.name.includes("__fk_repair")) {
      artifacts.add(row.name);
    }
    if (row.type === "table" && row.sql && (row.sql.includes("__legacy_migration") || row.sql.includes("__fk_repair"))) {
      artifacts.add(row.name);
    }
  }

  return Array.from(artifacts).sort();
}

export function assertSchemaIntegrity(db: DatabaseSync): void {
  const danglingFks = findDanglingForeignKeys(db);
  expect(
    danglingFks,
    `Expected no dangling foreign keys, but found:\n${JSON.stringify(danglingFks, null, 2)}`,
  ).toEqual([]);

  const leftoverArtifacts = findLeftoverMigrationArtifacts(db);
  expect(
    leftoverArtifacts,
    `Expected no leftover migration artifacts, but found:\n${JSON.stringify(leftoverArtifacts, null, 2)}`,
  ).toEqual([]);
}
