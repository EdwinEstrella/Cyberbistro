import { describe, expect, it } from "vitest";
import { shouldRunCheckoutFiscal } from "./checkoutFiscalSkip";

describe("shouldRunCheckoutFiscal", () => {
  it("returns false when skipFiscal is true even if all fiscal conditions are met", () => {
    const result = shouldRunCheckoutFiscal({
      skipFiscal: true,
      fiscalMode: "dgii_ecf",
      solicitaComprobante: true,
      canEmitDefaultConsumo: true,
      tenantId: "tenant-123",
    });
    expect(result).toBe(false);
  });

  it("returns false when fiscalMode is internal_receipt regardless of skipFiscal or solicitaComprobante", () => {
    const resultSkipOff = shouldRunCheckoutFiscal({
      skipFiscal: false,
      fiscalMode: "internal_receipt",
      solicitaComprobante: true,
      canEmitDefaultConsumo: true,
      tenantId: "tenant-123",
    });
    expect(resultSkipOff).toBe(false);

    const resultSkipOn = shouldRunCheckoutFiscal({
      skipFiscal: true,
      fiscalMode: "internal_receipt",
      solicitaComprobante: false,
      canEmitDefaultConsumo: false,
      tenantId: "tenant-123",
    });
    expect(resultSkipOn).toBe(false);
  });

  it("returns false when tenantId is missing (null, empty, or undefined)", () => {
    expect(
      shouldRunCheckoutFiscal({
        skipFiscal: false,
        fiscalMode: "dgii_ecf",
        solicitaComprobante: true,
        canEmitDefaultConsumo: true,
        tenantId: null,
      })
    ).toBe(false);

    expect(
      shouldRunCheckoutFiscal({
        skipFiscal: false,
        fiscalMode: "ncf_legacy",
        solicitaComprobante: true,
        canEmitDefaultConsumo: true,
        tenantId: "",
      })
    ).toBe(false);

    expect(
      shouldRunCheckoutFiscal({
        skipFiscal: false,
        fiscalMode: "dgii_ecf",
        solicitaComprobante: true,
        canEmitDefaultConsumo: true,
        tenantId: undefined,
      })
    ).toBe(false);
  });

  it("returns true when skip is off, mode is fiscal, and solicitaComprobante is true", () => {
    const resultEcf = shouldRunCheckoutFiscal({
      skipFiscal: false,
      fiscalMode: "dgii_ecf",
      solicitaComprobante: true,
      canEmitDefaultConsumo: false,
      tenantId: "tenant-123",
    });
    expect(resultEcf).toBe(true);

    const resultLegacy = shouldRunCheckoutFiscal({
      skipFiscal: false,
      fiscalMode: "ncf_legacy",
      solicitaComprobante: true,
      canEmitDefaultConsumo: false,
      tenantId: "tenant-123",
    });
    expect(resultLegacy).toBe(true);
  });

  it("returns true when skip is off, mode is fiscal, and canEmitDefaultConsumo is true", () => {
    const result = shouldRunCheckoutFiscal({
      skipFiscal: false,
      fiscalMode: "dgii_ecf",
      solicitaComprobante: false,
      canEmitDefaultConsumo: true,
      tenantId: "tenant-123",
    });
    expect(result).toBe(true);
  });

  it("returns false when neither solicitaComprobante nor canEmitDefaultConsumo is true", () => {
    const result = shouldRunCheckoutFiscal({
      skipFiscal: false,
      fiscalMode: "dgii_ecf",
      solicitaComprobante: false,
      canEmitDefaultConsumo: false,
      tenantId: "tenant-123",
    });
    expect(result).toBe(false);
  });
});
