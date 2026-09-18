import { afterEach, describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudOperationalCycleRows } from "../electron/persistence/cloudApply";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("TenantStore.listCierres", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;
  const tenantId = "tenant-cierres-list";

  afterEach(() => {
    if (store) { store.close(); store = null; }
    if (tempDir) { rmSync(tempDir, { recursive: true, force: true }); tempDir = null; }
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-cierres-list-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    return store;
  }

  it("exposes opening_cash as efectivo_inicial and returns printed_at/created_at ordered by cycle_number desc", () => {
    const s = setup();
    const db = s.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", tenantId, "Main");

    applyCloudOperationalCycleRows(db, tenantId, [
      { id: "c-1", tenant_id: tenantId, sucursal_id: "branch-1", business_day: "2026-09-15", cycle_number: 103, efectivo_inicial: 1000, opened_at: "2026-09-15T08:00:00Z", created_at: "2026-09-15T08:00:00Z" },
      { id: "c-2", tenant_id: tenantId, sucursal_id: "branch-1", business_day: "2026-09-16", cycle_number: 105, efectivo_inicial: 2000, opened_at: "2026-09-16T08:00:00Z", closed_at: "2026-09-16T20:00:00Z", printed_at: "2026-09-16T21:00:00Z", created_at: "2026-09-16T08:00:00Z" },
    ]);

    const rows = s.listCierres({ sucursalId: "branch-1" });
    expect(rows.map((r) => (r as Record<string, unknown>).cycle_number)).toEqual([105, 103]);
    const latest = rows[0] as Record<string, unknown>;
    expect(latest.efectivo_inicial).toBe(2000);
    expect(latest.printed_at).toBe("2026-09-16T21:00:00Z");
    expect(latest.created_at).toBe("2026-09-16T08:00:00Z");
    // The raw local column is not leaked under its storage name.
    expect(latest.opening_cash).toBeUndefined();
  });

  it("matches cycles with sucursal_id = 'main-process-default' or null when filtering by a specific branch", () => {
    const s = setup();
    const db = s.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-real", tenantId, "Branch Real");
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("main-process-default", tenantId, "Default");

    applyCloudOperationalCycleRows(db, tenantId, [
      { id: "c-default", tenant_id: tenantId, sucursal_id: "main-process-default", business_day: "2026-09-18", cycle_number: 108, efectivo_inicial: 500, opened_at: "2026-09-18T08:00:00Z", created_at: "2026-09-18T08:00:00Z" },
      { id: "c-null", tenant_id: tenantId, sucursal_id: null, business_day: "2026-09-18", cycle_number: 107, efectivo_inicial: 0, opened_at: "2026-09-18T07:00:00Z", created_at: "2026-09-18T07:00:00Z" },
      { id: "c-other", tenant_id: tenantId, sucursal_id: "branch-other", business_day: "2026-09-18", cycle_number: 106, efectivo_inicial: 0, opened_at: "2026-09-18T06:00:00Z", created_at: "2026-09-18T06:00:00Z" },
    ]);

    const rows = s.listCierres({ sucursalId: "branch-real" });
    const ids = rows.map((r) => (r as Record<string, unknown>).id);
    expect(ids).toContain("c-default");
    expect(ids).toContain("c-null");
    expect(ids).not.toContain("c-other");
  });
});
