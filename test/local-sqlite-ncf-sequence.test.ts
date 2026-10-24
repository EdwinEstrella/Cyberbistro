import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudTenantRows } from "../electron/persistence/cloudApply";
import { initializeTenantSchema } from "../electron/persistence/schema";
import {
  cloudNextSequenceFromSettings,
  computeNcfReservationStart,
  parseNcfLocalSequenceRequest,
  reserveLocalNcfSequence,
  resolveNcfBType,
  type NcfLocalPeek,
  type NcfLocalReservation,
} from "../electron/persistence/ncfLocalSequence";

const tenantId = "tenant-ncf";

describe("Local NCF sequence (SQLite)", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;

  afterEach(() => {
    store?.close();
    store = null;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  function pull(s: TenantStore, over: Record<string, unknown>): void {
    applyCloudTenantRows(s.getDatabase(), tenantId, [{
      id: tenantId,
      ncf_fiscal_activo: true,
      ncf_tipo_default: "B02",
      ncf_b01_secuencia_siguiente: 10,
      ncf_b02_secuencia_siguiente: 250,
      ncf_secuencias_por_tipo: { B01: 10, B02: 250 },
      ...over,
    }]);
  }

  function setup(cloud: Record<string, unknown> | null = {}): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-ncf-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    if (cloud) pull(store, cloud);
    return store;
  }

  const reserve = (s: TenantStore, preferredType: string | null = null): NcfLocalReservation => {
    const res = s.executeNcfLocalSequence({ action: "reserve", tenantId, preferredType });
    if (!res.ok) throw new Error(res.code + ": " + res.message);
    return res.data as NcfLocalReservation;
  };
  const peek = (s: TenantStore, preferredType: string | null = null): NcfLocalPeek => {
    const res = s.executeNcfLocalSequence({ action: "peek", tenantId, preferredType });
    if (!res.ok) throw new Error(res.code);
    return res.data as NcfLocalPeek;
  };

  it("fails with a clear message before the tenant was ever pulled", () => {
    const res = setup(null).executeNcfLocalSequence({ action: "reserve", tenantId });
    expect(res).toMatchObject({ ok: false, code: "no_local_tenant" });
  });

  it("fails when NCF billing is not active", () => {
    const res = setup({ ncf_fiscal_activo: false }).executeNcfLocalSequence({ action: "reserve", tenantId });
    expect(res).toMatchObject({ ok: false, code: "fiscal_inactive" });
  });

  it("starts at the pulled cloud counter and is monotonic per type", () => {
    const s = setup();
    expect([reserve(s), reserve(s), reserve(s)].map((r) => r.sequence)).toEqual([250, 251, 252]);
    expect(reserve(s)).toEqual({ tipoCodigo: "B02", sequence: 253 });
    expect(reserve(s, "B01")).toEqual({ tipoCodigo: "B01", sequence: 10 });
  });

  it("never goes back to a stale cloud counter but jumps to a newer one", () => {
    const s = setup();
    reserve(s);
    reserve(s); // 250, 251
    pull(s, { ncf_b02_secuencia_siguiente: 240, ncf_secuencias_por_tipo: { B02: 240 } });
    expect(reserve(s).sequence).toBe(252);
    pull(s, { ncf_b02_secuencia_siguiente: 400, ncf_secuencias_por_tipo: { B02: 400 } });
    expect(reserve(s).sequence).toBe(400);
  });

  it("starts past the highest NCF already present in local facturas", () => {
    const s = setup();
    const db = s.getDatabase();
    db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES ('suc', ?, 'Principal')").run(tenantId);
    db.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, ncf) VALUES ('f1', ?, 'suc', 'ncf_legacy', 100, 'committed', 'B0200000500')").run(tenantId);
    expect(reserve(s).sequence).toBe(501);
  });

  it("records cloud-issued numbers so the local counter never lags, and never moves backwards", () => {
    const s = setup();
    expect(s.executeNcfLocalSequence({ action: "record", tenantId, tipoCodigo: "B02", sequence: 600, source: "cloud" })).toEqual({ ok: true, data: null });
    s.executeNcfLocalSequence({ action: "record", tenantId, tipoCodigo: "B02", sequence: 300, source: "cloud" });
    expect(peek(s)).toEqual({ tipoCodigo: "B02", nextSequence: 601, localNextSequence: 601, cloudNextSequence: 601 });
    expect(reserve(s).sequence).toBe(601);
    // A local reservation advances only the local side: the cloud is now behind.
    expect(peek(s)).toMatchObject({ localNextSequence: 602, cloudNextSequence: 601 });
  });

  it("fails with exhausted at the end of the 8-digit range", () => {
    const s = setup({ ncf_b02_secuencia_siguiente: 99_999_999, ncf_secuencias_por_tipo: { B02: 99_999_999 } });
    expect(reserve(s).sequence).toBe(99_999_999);
    expect(s.executeNcfLocalSequence({ action: "reserve", tenantId })).toMatchObject({ ok: false, code: "exhausted" });
  });

  it("serializes concurrent reservations without duplicates", async () => {
    const s = setup();
    const results = await Promise.all(Array.from({ length: 40 }, async () => reserve(s).sequence));
    expect(new Set(results).size).toBe(40);
    expect([...results].sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => 250 + i));
  });

  it("serializes reservations across two connections to the same database", () => {
    const s = setup();
    const main = (s.getDatabase().prepare("PRAGMA database_list").all() as Array<{ name: string; file: string }>).find((d) => d.name === "main");
    const other = new DatabaseSync(main!.file);
    try {
      other.exec("PRAGMA busy_timeout = 2000;");
      const seen: number[] = [];
      for (let i = 0; i < 10; i++) {
        seen.push(reserve(s).sequence);
        seen.push(reserveLocalNcfSequence(other, tenantId).sequence);
      }
      expect(new Set(seen).size).toBe(20);
      expect(Math.max(...seen)).toBe(269);
    } finally {
      other.close();
    }
  });

  it("creates the counters table idempotently", () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, tenantId);
    initializeTenantSchema(db, tenantId);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ncf_local_sequences'").get()).toBeDefined();
    db.close();
  });
});

describe("ncfLocalSequence pure helpers", () => {
  it("resolves the type like cloudix_reserve_ncf", () => {
    expect(resolveNcfBType({ ncf_tipo_default: "B02" }, null)).toBe("B02");
    expect(resolveNcfBType({ ncf_tipo_default: "B02" }, "b01")).toBe("B01");
    expect(resolveNcfBType({}, "X99")).toBe("B01");
  });

  it("takes the max of every cloud place a counter lives", () => {
    expect(cloudNextSequenceFromSettings({ ncf_b01_secuencia_siguiente: 5, ncf_secuencias_por_tipo: { B01: 9 } }, "B01")).toBe(9);
    expect(cloudNextSequenceFromSettings({ ncf_tipo_default: "B01", ncf_secuencia_siguiente: 12 }, "B01")).toBe(12);
    expect(cloudNextSequenceFromSettings({}, "B14")).toBe(1);
    expect(computeNcfReservationStart({ cloudNext: 3, localNext: 7, maxIssued: 20 })).toBe(21);
  });

  it("validates untrusted IPC payloads", () => {
    expect(parseNcfLocalSequenceRequest({ action: "reserve", tenantId: "t" })).toEqual({ action: "reserve", tenantId: "t", preferredType: null });
    expect(parseNcfLocalSequenceRequest({ action: "record", tipoCodigo: "B01", sequence: 0, source: "cloud" })).toBeNull();
    expect(parseNcfLocalSequenceRequest({ action: "record", tipoCodigo: "B01", sequence: 3, source: "other" })).toBeNull();
    expect(parseNcfLocalSequenceRequest({ action: "drop" })).toBeNull();
    expect(parseNcfLocalSequenceRequest({ action: "peek", tenantId: 5 })).toBeNull();
  });
});
