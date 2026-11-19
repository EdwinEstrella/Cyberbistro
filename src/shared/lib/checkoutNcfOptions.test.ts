import { describe, expect, it } from "vitest";
import {
  CHECKOUT_ECF_SALE_TYPES,
  CHECKOUT_FISCAL_CREDIT_TYPE,
  DEFAULT_CHECKOUT_ECF_TYPE,
  NCF_E_TIPO_OPCIONES,
  getCheckoutNcfTypeOptions,
  pickCheckoutNcfType,
  pickDefaultCheckoutNcfType,
  type NcfETypeOption,
} from "./ncf";

describe("getCheckoutNcfTypeOptions", () => {
  it("Milenio case: returns only [E31, E32] when tenant has dgii_ecf, empty activeMap, and ranges for E31, E32, E34", () => {
    const options = getCheckoutNcfTypeOptions({
      fiscalMode: "dgii_ecf",
      activeMap: {},
      ecfAuthorizedTypes: ["E31", "E32", "E34"],
    });

    const codes = options.map((opt) => opt.codigo);
    expect(codes).toEqual(["E31", "E32"]);
  });

  it("excludes types that are explicitly set to false in activeMap", () => {
    const options = getCheckoutNcfTypeOptions({
      fiscalMode: "dgii_ecf",
      activeMap: { E32: false },
      ecfAuthorizedTypes: ["E31", "E32"],
    });

    const codes = options.map((opt) => opt.codigo);
    expect(codes).toEqual(["E31"]);
  });

  it("returns all 5 checkout sale types when ecfAuthorizedTypes is null or undefined (no range filtering)", () => {
    const optionsWithNull = getCheckoutNcfTypeOptions({
      fiscalMode: "dgii_ecf",
      activeMap: {},
      ecfAuthorizedTypes: null,
    });
    expect(optionsWithNull.map((opt) => opt.codigo)).toEqual([
      "E31",
      "E32",
      "E44",
      "E45",
      "E46",
    ]);

    const optionsWithUndefined = getCheckoutNcfTypeOptions({
      fiscalMode: "dgii_ecf",
      activeMap: {},
      ecfAuthorizedTypes: undefined,
    });
    expect(optionsWithUndefined.map((opt) => opt.codigo)).toEqual([
      "E31",
      "E32",
      "E44",
      "E45",
      "E46",
    ]);
  });

  it("never returns non-sale types (E33, E34, E41, E43, E47) even if authorized and active", () => {
    const options = getCheckoutNcfTypeOptions({
      fiscalMode: "dgii_ecf",
      activeMap: {},
      ecfAuthorizedTypes: [
        "E31",
        "E32",
        "E33",
        "E34",
        "E41",
        "E43",
        "E44",
        "E45",
        "E46",
        "E47",
      ],
    });

    const codes = options.map((opt) => opt.codigo);
    expect(codes).toEqual(["E31", "E32", "E44", "E45", "E46"]);
    expect(codes).not.toContain("E33");
    expect(codes).not.toContain("E34");
    expect(codes).not.toContain("E41");
    expect(codes).not.toContain("E43");
    expect(codes).not.toContain("E47");
  });

  it("returns an empty array when fiscalMode is ncf_legacy or internal_receipt", () => {
    expect(
      getCheckoutNcfTypeOptions({
        fiscalMode: "ncf_legacy",
        activeMap: {},
        ecfAuthorizedTypes: ["E31", "E32"],
      })
    ).toEqual([]);

    expect(
      getCheckoutNcfTypeOptions({
        fiscalMode: "internal_receipt",
        activeMap: {},
        ecfAuthorizedTypes: ["E31", "E32"],
      })
    ).toEqual([]);
  });

  it("preserves catalog order regardless of the input order of ecfAuthorizedTypes", () => {
    const options = getCheckoutNcfTypeOptions({
      fiscalMode: "dgii_ecf",
      activeMap: {},
      ecfAuthorizedTypes: ["E46", "E32", "E31"],
    });

    expect(options.map((opt) => opt.codigo)).toEqual(["E31", "E32", "E46"]);
  });

  it("ensures CHECKOUT_ECF_SALE_TYPES has exactly the 5 sale types and default is E32", () => {
    expect(CHECKOUT_ECF_SALE_TYPES).toEqual(["E31", "E32", "E44", "E45", "E46"]);
    expect(DEFAULT_CHECKOUT_ECF_TYPE).toBe("E32");
  });
});

const optE31 = NCF_E_TIPO_OPCIONES.find((o) => o.codigo === "E31")!;
const optE32 = NCF_E_TIPO_OPCIONES.find((o) => o.codigo === "E32")!;
const optE44 = NCF_E_TIPO_OPCIONES.find((o) => o.codigo === "E44")!;

describe("pickDefaultCheckoutNcfType", () => {
  it("picks E32 if E32 is present in options", () => {
    expect(pickDefaultCheckoutNcfType([optE31, optE32])).toBe("E32");
  });

  it("picks the first option code if E32 is absent", () => {
    expect(pickDefaultCheckoutNcfType([optE31, optE44])).toBe("E31");
  });

  it("returns null when options list is empty", () => {
    expect(pickDefaultCheckoutNcfType([])).toBeNull();
  });
});

describe("pickCheckoutNcfType", () => {
  const optionsWithE31AndE32: NcfETypeOption[] = [optE31, optE32, optE44];
  const optionsWithoutE31: NcfETypeOption[] = [optE32, optE44];
  const optionsWithOnlyE44: NcfETypeOption[] = [optE44];

  it("ensures CHECKOUT_FISCAL_CREDIT_TYPE is E31", () => {
    expect(CHECKOUT_FISCAL_CREDIT_TYPE).toBe("E31");
  });

  it("returns E31 when credit is requested and E31 is available", () => {
    expect(pickCheckoutNcfType(optionsWithE31AndE32, true)).toBe("E31");
  });

  it("falls back to default (E32 if available) when credit is requested but E31 is absent", () => {
    expect(pickCheckoutNcfType(optionsWithoutE31, true)).toBe("E32");
  });

  it("falls back to the first available option when credit is requested and neither E31 nor E32 are available", () => {
    expect(pickCheckoutNcfType(optionsWithOnlyE44, true)).toBe("E44");
  });

  it("returns default E32 when credit is not requested and E32 is available", () => {
    expect(pickCheckoutNcfType(optionsWithE31AndE32, false)).toBe("E32");
  });

  it("returns first available option when credit is not requested and E32 is absent", () => {
    expect(pickCheckoutNcfType([optE31, optE44], false)).toBe("E31");
  });

  it("returns null when options list is empty regardless of requestsFiscalCredit", () => {
    expect(pickCheckoutNcfType([], true)).toBeNull();
    expect(pickCheckoutNcfType([], false)).toBeNull();
  });
});
