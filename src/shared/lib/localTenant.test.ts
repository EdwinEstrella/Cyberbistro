import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLocalTenant, readLocalTenant } from "./localTenant";

describe("localTenant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes the bridge row and rejects other tenants or malformed input", () => {
    expect(normalizeLocalTenant({ id: "t1", rnc: "1" }, "t1")).toEqual({ id: "t1", rnc: "1" });
    expect(normalizeLocalTenant({ rnc: "1" }, "t1")).toEqual({ id: "t1", rnc: "1" });
    expect(normalizeLocalTenant({ id: "t2" }, "t1")).toBeNull();
    expect(normalizeLocalTenant(null, "t1")).toBeNull();
    expect(normalizeLocalTenant([], "t1")).toBeNull();
  });

  it("reads the tenant through the catalog:list bridge", async () => {
    const listCatalog = vi.fn().mockResolvedValue({ ok: true, data: { platos: [], menuCategories: [], tenant: { id: "t1", nombre_negocio: "X" } } });
    vi.stubGlobal("window", { electronAPI: { listCatalog } });
    await expect(readLocalTenant("t1")).resolves.toEqual({ id: "t1", nombre_negocio: "X" });
  });

  it("returns null without a bridge or when it fails", async () => {
    vi.stubGlobal("window", {});
    await expect(readLocalTenant("t1")).resolves.toBeNull();
    vi.stubGlobal("window", { electronAPI: { listCatalog: vi.fn().mockRejectedValue(new Error("boom")) } });
    await expect(readLocalTenant("t1")).resolves.toBeNull();
  });
});
