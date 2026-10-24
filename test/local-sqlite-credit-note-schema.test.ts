import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";

const COLUMNS = ["credit_note_of", "ref_ncf", "ref_fecha_emision", "ref_codigo_modificacion", "ref_razon_modificacion"];

function facturaColumns(db: DatabaseSync): Array<{ name: string; type: string }> {
  return (db.prepare("PRAGMA table_info(facturas)").all() as Array<{ name: string; type: string }>);
}

describe("local facturas credit note columns", () => {
  it("adds the nullable columns on a fresh database", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, "tenant-a");
    const cols = facturaColumns(db);
    for (const name of COLUMNS) expect(cols.map((c) => c.name)).toContain(name);
    expect(cols.find((c) => c.name === "ref_codigo_modificacion")?.type).toBe("INTEGER");
    db.close();
  });

  it("evolves an existing database idempotently", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, "tenant-a");
    for (const name of COLUMNS) db.exec(`ALTER TABLE facturas DROP COLUMN ${name};`);
    expect(facturaColumns(db).map((c) => c.name)).not.toContain("credit_note_of");
    initializeTenantSchema(db, "tenant-a");
    initializeTenantSchema(db, "tenant-a");
    for (const name of COLUMNS) expect(facturaColumns(db).map((c) => c.name)).toContain(name);
    db.close();
  });
});
