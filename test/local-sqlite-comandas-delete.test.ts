import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { applyCloudDeletes } from "../electron/persistence/cloudApply";

const TENANT = "tenant-comandas-cleanup";
const OTHER = "tenant-other";

function seedComanda(db: DatabaseSync, id: string, opts: { tenant?: string; branch?: string; createdAt?: string | null; withLinks?: boolean } = {}): void {
  const tenant = opts.tenant ?? TENANT;
  db.prepare("INSERT OR IGNORE INTO tenants (id) VALUES (?)").run(tenant);
  db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(opts.branch ?? "branch-1", tenant, "B");
  db.prepare("INSERT INTO comandas (id, tenant_id, sucursal_id, state, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .run(id, tenant, opts.branch ?? "branch-1", opts.createdAt === undefined ? new Date().toISOString() : opts.createdAt);
  if (opts.withLinks) {
    db.prepare("INSERT INTO consumos (id, tenant_id, sucursal_id, comanda_id, name, quantity, unit_price, subtotal, state) VALUES (?, ?, ?, ?, 'x', 1, 1, 1, 'sent_to_kitchen')")
      .run(`consumo-${id}`, tenant, opts.branch ?? "branch-1", id);
    db.prepare("INSERT INTO produccion_cocina (id, tenant_id, sucursal_id, comanda_id, state) VALUES (?, ?, ?, ?, 'pending')")
      .run(`prod-${id}`, tenant, opts.branch ?? "branch-1", id);
  }
}

const ids = (db: DatabaseSync, table = "comandas") =>
  (db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{ id: string }>).map((r) => r.id);

describe("comandas cloud delete (pull)", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
  });
  afterEach(() => db.close());

  it("cloud delete of a comanda with consumos and produccion_cocina succeeds and keeps consumos unlinked", () => {
    seedComanda(db, "c1", { withLinks: true });
    expect(applyCloudDeletes(db, "comandas", ["c1"], TENANT)).toBe(true);
    expect(ids(db)).toEqual([]);
    expect(ids(db, "produccion_cocina")).toEqual([]);
    expect(db.prepare("SELECT comanda_id FROM consumos WHERE id='consumo-c1'").get()).toEqual({ comanda_id: null });
  });

});
