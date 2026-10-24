import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { purgeExpiredComandasOlderThan } from "../electron/persistence/comandasCleanup";

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

describe("comandas cleanup", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
  });
  afterEach(() => db.close());

  it("T3: expired purge handles both ISO and SQLite timestamp formats and keeps recent rows", () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    seedComanda(db, "old-iso", { createdAt: "2026-10-10T08:00:00.123+00:00", withLinks: true });
    seedComanda(db, "old-sqlite", { createdAt: "2026-10-10 08:00:00" });
    seedComanda(db, "recent-iso", { createdAt: "2026-10-23T08:00:00.000+00:00" });
    seedComanda(db, "recent-sqlite", { createdAt: "2026-10-23 08:00:00" });
    seedComanda(db, "no-date", { createdAt: null });
    expect(purgeExpiredComandasOlderThan(db, TENANT, 3, now)).toBe(2);
    expect(ids(db)).toEqual(["no-date", "recent-iso", "recent-sqlite"]);
  });
});
