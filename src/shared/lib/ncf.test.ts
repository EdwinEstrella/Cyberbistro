import { describe, expect, it } from "vitest";
import { construirCadenaNcf, esCodigoNcfValido, prepareNcfForFacturaInsert } from "./ncf";

describe("ncf", () => {
  it("esCodigoNcfValido acepta B01 y E32", () => {
    expect(esCodigoNcfValido("B01")).toBe(true);
    expect(esCodigoNcfValido("e32")).toBe(true);
    expect(esCodigoNcfValido("X01")).toBe(false);
  });

  it("construirCadenaNcf arma 11 caracteres", () => {
    expect(construirCadenaNcf("B01", 1)).toBe("B0100000001");
    expect(construirCadenaNcf("B01", 99999999)).toBe("B0199999999");
    expect(construirCadenaNcf("B01", 0)).toBeNull();
  });

  it("prepareNcfForFacturaInsert respeta fiscal inactivo", () => {
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
        ncf_tipo_default: "B01",
        ncf_secuencia_siguiente: 5,
      })
    ).toEqual({
      ncf: "B0100000005",
      ncf_tipo: expect.stringContaining("B01"),
      usedSequence: 5,
    });
  });
});
