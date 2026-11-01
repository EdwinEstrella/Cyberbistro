import { describe, expect, it } from "vitest";
import {
  toDraft,
  isLimitsFormDirty,
  isPaymentsFormDirty,
  validateLimitsDraft,
  validatePaymentDayInput,
  parseNullableLimit,
  parseNullablePositiveLimit,
  parsePaymentDay,
} from "../dirtyDetection";
import type { LimitDraft, TenantRow } from "../types";

describe("dirtyDetection & limit parsing", () => {
  const sampleTenant: TenantRow = {
    id: "t1",
    user_limit_enabled: true,
    cajera_user_limit: 2,
    cocina_user_limit: 3,
    mesero_user_limit: 4,
    sucursal_limit_enabled: true,
    sucursal_limit: 2,
    payment_day_of_month: 15,
  };

  it("converts tenant to initial draft", () => {
    const draft = toDraft(sampleTenant);
    expect(draft.userLimitEnabled).toBe(true);
    expect(draft.cajeraUserLimit).toBe("2");
    expect(draft.cocinaUserLimit).toBe("3");
    expect(draft.meseroUserLimit).toBe("4");
    expect(draft.sucursalLimit).toBe("2");
    expect(draft.paymentDayOfMonth).toBe("15");
  });

  it("detects when limits form is dirty", () => {
    const initial = toDraft(sampleTenant);
    expect(isLimitsFormDirty(initial, initial)).toBe(false);

    const modified: LimitDraft = { ...initial, cajeraUserLimit: "5" };
    expect(isLimitsFormDirty(modified, initial)).toBe(true);

    const toggleSucursal: LimitDraft = { ...initial, sucursalLimitEnabled: false };
    expect(isLimitsFormDirty(toggleSucursal, initial)).toBe(true);
  });

  it("detects when payments form is dirty", () => {
    const initial = toDraft(sampleTenant);
    expect(isPaymentsFormDirty(initial, initial)).toBe(false);

    const modified: LimitDraft = { ...initial, paymentDayOfMonth: "20" };
    expect(isPaymentsFormDirty(modified, initial)).toBe(true);
  });

  it("validates limits draft accurately", () => {
    const initial = toDraft(sampleTenant);
    expect(validateLimitsDraft(initial).valid).toBe(true);

    const invalid: LimitDraft = { ...initial, cajeraUserLimit: "-1", sucursalLimit: "0" };
    const result = validateLimitsDraft(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.cajeraUserLimit).toBeTruthy();
    expect(result.errors.sucursalLimit).toBeTruthy();
  });

  it("validates payment day", () => {
    expect(validatePaymentDayInput("1").valid).toBe(true);
    expect(validatePaymentDayInput("31").valid).toBe(true);
    expect(validatePaymentDayInput("").valid).toBe(true);
    expect(validatePaymentDayInput("0").valid).toBe(false);
    expect(validatePaymentDayInput("32").valid).toBe(false);
    expect(validatePaymentDayInput("abc").valid).toBe(false);
  });

  it("parses nullable limits and throws for invalid numbers", () => {
    expect(parseNullableLimit("")).toBeNull();
    expect(parseNullableLimit("  ")).toBeNull();
    expect(parseNullableLimit("4")).toBe(4);
    expect(() => parseNullableLimit("-5")).toThrow();

    expect(parseNullablePositiveLimit("")).toBeNull();
    expect(parseNullablePositiveLimit("1")).toBe(1);
    expect(() => parseNullablePositiveLimit("0")).toThrow();

    expect(parsePaymentDay("")).toBeNull();
    expect(parsePaymentDay("15")).toBe(15);
    expect(() => parsePaymentDay("35")).toThrow();
  });
});
