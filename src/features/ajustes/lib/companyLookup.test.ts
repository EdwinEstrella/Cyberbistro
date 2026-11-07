import { describe, expect, it, vi } from "vitest";
import { handleDgiiRncLookup } from "./companyLookup";
import type { BusinessRncLookup } from "../../../shared/lib/dgiiRncLookup";

describe("handleDgiiRncLookup", () => {
  it("returns error early if RNC is empty or whitespace", async () => {
    const mockLookup = vi.fn();
    const res = await handleDgiiRncLookup("   ", mockLookup);

    expect(res).toEqual({
      success: false,
      error: "Ingresá un RNC válido.",
    });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("populates tradeName if present, falling back to legalName", async () => {
    const mockDataWithTrade: BusinessRncLookup = {
      rnc: "131000001",
      legalName: "EMPRESA DOMINICANA SRL",
      tradeName: "RESTAURANTE EL CHEF",
      status: "ACTIVO",
    };
    const mockLookup = vi.fn().mockResolvedValue({ data: mockDataWithTrade, error: null });

    const res = await handleDgiiRncLookup("131-00000-1", mockLookup);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.rnc).toBe("131000001");
      expect(res.data.nombre_empresa).toBe("RESTAURANTE EL CHEF");
      expect(res.data.legalName).toBe("EMPRESA DOMINICANA SRL");
      expect(res.message).toBe("Empresa encontrada: EMPRESA DOMINICANA SRL.");
    }
  });

  it("uses legalName if tradeName is empty", async () => {
    const mockDataWithoutTrade: BusinessRncLookup = {
      rnc: "131000002",
      legalName: "SOLUCIONES TECNOLOGICAS EIRL",
      tradeName: "",
      status: "ACTIVO",
    };
    const mockLookup = vi.fn().mockResolvedValue({ data: mockDataWithoutTrade, error: null });

    const res = await handleDgiiRncLookup("131000002", mockLookup);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombre_empresa).toBe("SOLUCIONES TECNOLOGICAS EIRL");
    }
  });

  it("surfaces lookup error message if lookup fails", async () => {
    const mockLookup = vi.fn().mockResolvedValue({
      data: null,
      error: "No encontramos un negocio con ese RNC.",
    });

    const res = await handleDgiiRncLookup("000000000", mockLookup);

    expect(res).toEqual({
      success: false,
      error: "No encontramos un negocio con ese RNC.",
    });
  });

  it("handles thrown exceptions safely", async () => {
    const mockLookup = vi.fn().mockRejectedValue(new Error("Network connection lost"));

    const res = await handleDgiiRncLookup("131000001", mockLookup);

    expect(res).toEqual({
      success: false,
      error: "Network connection lost",
    });
  });
});
