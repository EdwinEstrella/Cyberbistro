import { describe, expect, it } from "vitest";
import {
  buildBSequenceMap,
  buildTenantNcfUpdatePayload,
  construirCadenaNcf,
  esCodigoNcfValido,
  ncfTypeRequiresClientRnc,
  normalizeNcfTypeForFiscalMode,
  prepareNcfForFacturaInsert,
} from "./ncf";

describe("ncf", () => {
  it("esCodigoNcfValido acepta B01 y E32", () => {
    expect(esCodigoNcfValido("B01")).toBe(true);
    expect(esCodigoNcfValido("e32")).toBe(true);
    expect(esCodigoNcfValido("X01")).toBe(false);
  });

  it("ncfTypeRequiresClientRnc exige RNC para B01 y E31", () => {
    expect(ncfTypeRequiresClientRnc("B01")).toBe(true);
    expect(ncfTypeRequiresClientRnc("E31")).toBe(true);
    expect(ncfTypeRequiresClientRnc("B02")).toBe(false);
    expect(ncfTypeRequiresClientRnc("E32")).toBe(false);
  });

  it("normalizeNcfTypeForFiscalMode mapea correctamente familias", () => {
    // B a E en ecf
    expect(normalizeNcfTypeForFiscalMode("B01", "dgii_ecf")).toBe("E31");
    expect(normalizeNcfTypeForFiscalMode("B02", "dgii_ecf")).toBe("E32");
    expect(normalizeNcfTypeForFiscalMode("B14", "dgii_ecf")).toBe("E41");
    expect(normalizeNcfTypeForFiscalMode("E31", "dgii_ecf")).toBe("E31"); // ya es E
    
    // E a B en legacy
    expect(normalizeNcfTypeForFiscalMode("E31", "ncf_legacy")).toBe("B01");
    expect(normalizeNcfTypeForFiscalMode("E32", "ncf_legacy")).toBe("B02");
    expect(normalizeNcfTypeForFiscalMode("E47", "ncf_legacy")).toBe("B17");
    expect(normalizeNcfTypeForFiscalMode("B01", "ncf_legacy")).toBe("B01"); // ya es B

    // Fallbacks
    expect(normalizeNcfTypeForFiscalMode("B99" as any, "dgii_ecf")).toBe("E32"); // defaults to B02 early, then maps to E32
    expect(normalizeNcfTypeForFiscalMode("E99" as any, "ncf_legacy")).toBe("B02"); // early validation
  });

  it("construirCadenaNcf arma 11 caracteres", () => {
    expect(construirCadenaNcf("B01", 1)).toBe("B0100000001");
    expect(construirCadenaNcf("B01", 99999999)).toBe("B0199999999");
    expect(construirCadenaNcf("B01", 0)).toBeNull();
  });

  it("buildBSequenceMap migra la secuencia legacy al tipo B activo", () => {
    expect(buildBSequenceMap(null, "B02", 141)).toEqual({
      B01: 1,
      B02: 141,
      B14: 1,
      B15: 1,
      B16: 1,
      B17: 1,
    });
  });

  it("buildBSequenceMap prioriza columnas separadas por tipo sobre el json legado", () => {
    expect(
      buildBSequenceMap(
        {
          B01: 12,
          B02: 22,
        },
        "B02",
        141,
        {
          ncf_b01_secuencia_siguiente: 55,
          ncf_b02_secuencia_siguiente: 77,
        }
      )
    ).toEqual({
      B01: 55,
      B02: 77,
      B14: 1,
      B15: 1,
      B16: 1,
      B17: 1,
    });
  });

  it("prepareNcfForFacturaInsert respeta fiscal inactivo y usa la secuencia del tipo", () => {
    expect(
      prepareNcfForFacturaInsert({
        ncf_fiscal_activo: false,
        ncf_tipo_default: "B01",
        ncf_secuencia_siguiente: 5,
      })
    ).toBeNull();

    expect(
      prepareNcfForFacturaInsert({
        ncf_fiscal_activo: true,
        ncf_tipo_default: "B02",
        ncf_secuencia_siguiente: 5,
        ncf_secuencias_por_tipo: {
          B01: 12,
          B02: 141,
        },
      })
    ).toEqual({
      ncf: "B0200000141",
      ncf_tipo: expect.stringContaining("B02"),
      tipoCodigo: "B02",
      usedSequence: 141,
    });
  });

  it("prepareNcfForFacturaInsert permite forzar un tipo NCF manual", () => {
    expect(
      prepareNcfForFacturaInsert(
        {
          ncf_fiscal_activo: true,
          ncf_tipo_default: "B01",
          ncf_b01_secuencia_siguiente: 10,
          ncf_b02_secuencia_siguiente: 45,
        },
        "B02"
      )
    ).toEqual({
      ncf: "B0200000045",
      ncf_tipo: expect.stringContaining("B02"),
      tipoCodigo: "B02",
      usedSequence: 45,
    });
  });

  it("buildTenantNcfUpdatePayload genera columnas separadas y espejo legado", () => {
    expect(
      buildTenantNcfUpdatePayload(true, "B14", {
        B01: 9,
        B02: 10,
        B14: 200,
      })
    ).toMatchObject({
      ncf_fiscal_activo: true,
      ncf_tipo_default: "B14",
      ncf_secuencia_siguiente: 200,
      ncf_b01_secuencia_siguiente: 9,
      ncf_b02_secuencia_siguiente: 10,
      ncf_b14_secuencia_siguiente: 200,
    });
  });
});
