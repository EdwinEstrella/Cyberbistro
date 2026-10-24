import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLocalSucursales, readLocalSucursales } from "./localSucursales";

describe("localSucursales", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes rows and drops malformed or foreign-tenant entries", () => {
    const rows = normalizeLocalSucursales(
      [
        { id: "a", tenant_id: "t1", nombre: "Centro", direccion: "x", telefono: null, activa: true },
        { id: "b", tenant_id: "t1", nombre: " ", activa: 0 },
        { id: "c", tenant_id: "other", nombre: "Foreign" },
        { nombre: "no id" },
        null,
      ],
      "t1",
    );
    expect(rows).toEqual([
      { id: "a", tenant_id: "t1", nombre: "Centro", direccion: "x", telefono: null, activa: true },
      { id: "b", tenant_id: "t1", nombre: "Sucursal", direccion: null, telefono: null, activa: false },
    ]);
    expect(normalizeLocalSucursales(undefined, "t1")).toEqual([]);
  });

  it("reads through the desktop bridge", async () => {
    vi.stubGlobal("window", {
      electronAPI: { listCatalog: async () => ({ ok: true, data: { platos: [], menuCategories: [], sucursales: [{ id: "a", tenant_id: "t1", nombre: "Centro", activa: true }] } }) },
    });
    expect((await readLocalSucursales("t1")).map((r) => r.id)).toEqual(["a"]);
  });

  it("returns [] when the bridge is missing or throws", async () => {
    vi.stubGlobal("window", {});
    expect(await readLocalSucursales("t1")).toEqual([]);
    vi.stubGlobal("window", { electronAPI: { listCatalog: async () => { throw new Error("boom"); } } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readLocalSucursales("t1")).toEqual([]);
  });
});
