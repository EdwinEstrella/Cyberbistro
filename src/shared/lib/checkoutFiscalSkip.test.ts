import { describe, expect, it } from "vitest";
import {
  resolveInitialSkipFiscal,
  resolveTogglesAfterSkipChange,
  shouldRunCheckoutFiscal,
} from "./checkoutFiscalSkip";

describe("resolveInitialSkipFiscal", () => {
  it("starts ON only when the business setting is explicitly true", () => {
    expect(resolveInitialSkipFiscal(true)).toBe(true);
  });

  it("starts OFF when the setting is false, null or undefined", () => {
    expect(resolveInitialSkipFiscal(false)).toBe(false);
    expect(resolveInitialSkipFiscal(null)).toBe(false);
    expect(resolveInitialSkipFiscal(undefined)).toBe(false);
  });
});

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

describe("resolveTogglesAfterSkipChange", () => {
  it("when skipFiscal is toggled ON (true): disables ITBIS and clears solicitaComprobante", () => {
    const effects = resolveTogglesAfterSkipChange(true);
    expect(effects).toEqual({
      itbisEnabled: false,
      clearSolicitaComprobante: true,
    });
  });

  it("when skipFiscal is toggled OFF (false): enables ITBIS and keeps solicitaComprobante intact", () => {
    const effects = resolveTogglesAfterSkipChange(false);
    expect(effects).toEqual({
      itbisEnabled: true,
      clearSolicitaComprobante: false,
    });
  });
});
