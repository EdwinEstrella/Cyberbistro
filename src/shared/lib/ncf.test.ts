import { describe, expect, it } from "vitest";
import {
  construirCadenaNcf,
  esCodigoNcfValido,
  isNcfTypeActive,
  ncfTypeRequiresClientRnc,
  normalizeNcfActiveMap,
  normalizeNcfSequenceMap,
  normalizeNcfTypeForFiscalMode,
  prepareNcfForFacturaInsert,
} from "./ncf";

describe("ncf tipos activos", () => {
  it("un tipo está activo salvo que esté explícitamente en false", () => {
    expect(isNcfTypeActive({}, "B01")).toBe(true); // mapa vacío = todos activos
    expect(isNcfTypeActive(null, "B02")).toBe(true);
    expect(isNcfTypeActive({ B01: false }, "B01")).toBe(false);
    expect(isNcfTypeActive({ B01: false }, "B02")).toBe(true); // otro tipo sigue activo
    expect(isNcfTypeActive({ B01: true }, "B01")).toBe(true);
  });

  it("normalizeNcfActiveMap descarta códigos inválidos y normaliza a booleanos", () => {
    expect(normalizeNcfActiveMap({ b01: false, "E31": true, "xx": false })).toEqual({ B01: false, E31: true });
    expect(normalizeNcfActiveMap("no-objeto")).toEqual({});
    expect(normalizeNcfActiveMap(JSON.stringify({ B01: false, E31: true }))).toEqual({ B01: false, E31: true });
  });

  it("normalizeNcfSequenceMap normaliza objetos y cadenas JSON con códigos B y E", () => {
    expect(normalizeNcfSequenceMap({ B01: 5, E31: 12, E32: "4", invalid: 9 })).toEqual({
      B01: 5,
      E31: 12,
      E32: 4,
    });
    expect(normalizeNcfSequenceMap(JSON.stringify({ E31: 15, E32: 8 }))).toEqual({
      E31: 15,
      E32: 8,
    });
    expect(normalizeNcfSequenceMap("invalid-json")).toEqual({});
  });
});

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

    // Fallbacks
    expect(normalizeNcfTypeForFiscalMode("B99" as any, "dgii_ecf")).toBe("E32"); // defaults to E32
  });

  it("construirCadenaNcf arma 11 caracteres", () => {
    expect(construirCadenaNcf("B01", 1)).toBe("B0100000001");
    expect(construirCadenaNcf("B01", 99999999)).toBe("B0199999999");
    expect(construirCadenaNcf("B01", 0)).toBeNull();
  });

  it("construirCadenaNcf arma e-NCF de 13 caracteres (E + tipo + 10 digitos)", () => {
    expect(construirCadenaNcf("E31", 1)).toBe("E310000000001");
    expect(construirCadenaNcf("E32", 300000)).toBe("E320000300000");
    expect(construirCadenaNcf("E34", 9999999999)).toBe("E349999999999");
    expect(construirCadenaNcf("E34", 10000000000)).toBeNull();
    expect(construirCadenaNcf("B01", 100000000)).toBeNull();
  });

  it("prepareNcfForFacturaInsert respeta fiscal inactivo y usa la secuencia del tipo", () => {
    expect(
      prepareNcfForFacturaInsert({
        ncf_fiscal_activo: false,
        ncf_tipo_default: "E32",
        ncf_secuencias_por_tipo: { E32: 5 },
      })
    ).toBeNull();

    expect(
      prepareNcfForFacturaInsert({
        ncf_fiscal_activo: true,
        ncf_tipo_default: "E32",
        ncf_secuencias_por_tipo: {
          E31: 12,
          E32: 141,
        },
      })
    ).toEqual({
      ncf: "E320000000141",
      ncf_tipo: expect.stringContaining("E32"),
      tipoCodigo: "E32",
      usedSequence: 141,
    });
  });

  it("prepareNcfForFacturaInsert rechaza tipos B para nuevas facturas", () => {
    expect(
      prepareNcfForFacturaInsert(
        {
          ncf_fiscal_activo: true,
          ncf_tipo_default: "E32",
          ncf_secuencias_por_tipo: { B02: 45, E32: 10 },
        },
        "B02"
      )
    ).toBeNull();
  });

  it("prepareNcfForFacturaInsert permite forzar un tipo e-CF manual", () => {
    expect(
      prepareNcfForFacturaInsert(
        {
          ncf_fiscal_activo: true,
          ncf_tipo_default: "E32",
          ncf_secuencias_por_tipo: { E31: 10, E32: 45 },
        },
        "E31"
      )
    ).toEqual({
      ncf: "E310000000010",
      ncf_tipo: expect.stringContaining("E31"),
      tipoCodigo: "E31",
      usedSequence: 10,
    });
  });
});
