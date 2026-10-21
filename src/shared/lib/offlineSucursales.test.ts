import { describe, expect, it } from "vitest";
import { buildOfflineSucursales } from "./offlineSucursales";

describe("buildOfflineSucursales", () => {
  it("returns a single Principal branch from the saved default branch", () => {
    const rows = buildOfflineSucursales({ tenantId: "t1", allowedBranchIds: [], defaultBranchId: "b1" });
    expect(rows).toEqual([
      { id: "b1", tenant_id: "t1", nombre: "Principal", direccion: null, telefono: null, activa: true },
    ]);
  });

  it("uses the allowed branch ids when there is no saved default", () => {
    const rows = buildOfflineSucursales({ tenantId: "t1", allowedBranchIds: ["b1", "b2"], defaultBranchId: null });
    expect(rows.map((r) => r.id)).toEqual(["b1", "b2"]);
  });

  it("dedupes and puts the default branch first", () => {
    const rows = buildOfflineSucursales({ tenantId: "t1", allowedBranchIds: ["b1", "b2"], defaultBranchId: "b2" });
    expect(rows.map((r) => r.id)).toEqual(["b2", "b1"]);
  });

  it("returns [] when nothing local is known and ignores blank ids", () => {
    expect(buildOfflineSucursales({ tenantId: "t1", allowedBranchIds: ["", "  "], defaultBranchId: null })).toEqual([]);
    expect(buildOfflineSucursales({ tenantId: "t1" })).toEqual([]);
  });
});
