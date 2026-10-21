import { describe, expect, it, vi } from "vitest";
import { resolveKitchenPrintTenant } from "./kitchenPrintTenant";

const cloudRow = { nombre_negocio: "Cloud", rnc: "1", direccion: "d", telefono: "t", logo_url: null, moneda: "DOP" };

describe("resolveKitchenPrintTenant", () => {
  it("uses the cloud row when reachable", async () => {
    const readLocal = vi.fn();
    const r = await resolveKitchenPrintTenant({
      fetchCloud: async () => ({ data: cloudRow, error: null }),
      readLocal,
      cloudUnavailable: false,
    });
    expect(r.nombre_negocio).toBe("Cloud");
    expect(readLocal).not.toHaveBeenCalled();
  });

  it("skips the cloud and uses the local tenant when unavailable", async () => {
    const fetchCloud = vi.fn();
    const r = await resolveKitchenPrintTenant({
      fetchCloud,
      readLocal: async () => ({ nombre_negocio: "Local", rnc: "9" }),
      cloudUnavailable: true,
    });
    expect(fetchCloud).not.toHaveBeenCalled();
    expect(r).toMatchObject({ nombre_negocio: "Local", rnc: "9", direccion: null });
  });

  it("falls back to local when the cloud read throws or errors", async () => {
    const local = async () => ({ nombre_negocio: "Local" });
    const thrown = await resolveKitchenPrintTenant({
      fetchCloud: async () => { throw new Error("530"); },
      readLocal: local,
      cloudUnavailable: false,
    });
    const errored = await resolveKitchenPrintTenant({
      fetchCloud: async () => ({ data: null, error: { message: "x" } }),
      readLocal: local,
      cloudUnavailable: false,
    });
    expect(thrown.nombre_negocio).toBe("Local");
    expect(errored.nombre_negocio).toBe("Local");
  });

  it("returns a minimal header instead of null when no data exists anywhere", async () => {
    const r = await resolveKitchenPrintTenant({
      fetchCloud: async () => ({ data: null, error: { message: "x" } }),
      readLocal: async () => { throw new Error("no sqlite"); },
      cloudUnavailable: true,
    });
    expect(r).toEqual({ nombre_negocio: null, rnc: null, direccion: null, telefono: null, logo_url: null, moneda: null });
  });
});
