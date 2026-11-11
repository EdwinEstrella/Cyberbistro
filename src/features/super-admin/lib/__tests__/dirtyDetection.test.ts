import { describe, expect, it } from "vitest";
import {
  toDraft,
  isLimitsFormDirty,
  isPaymentsFormDirty,
  validateLimitsDraft,
  validatePaymentDayInput,
  validatePaymentsDraft,
  parseNullableLimit,
  parseNullablePositiveLimit,
  parsePaymentDay,
  parseDebtAmount,
  parseDebtCurrency,
  parseDebtDueDate,
  isValidIsoDate,
  isDebtDraftChanged,
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

  it("converts tenant with debt to initial draft and falls back to defaults", () => {
    const draftWithoutDebt = toDraft(sampleTenant);
    expect(draftWithoutDebt.debtAmount).toBe("");
    expect(draftWithoutDebt.debtCurrency).toBe("DOP");
    expect(draftWithoutDebt.debtDueDate).toBe("");

    const tenantWithDebt: TenantRow = {
      ...sampleTenant,
      debt_amount: 12500.5,
      debt_currency: "USD",
      debt_due_date: "2026-11-20",
    };
    const draftWithDebt = toDraft(tenantWithDebt);
    expect(draftWithDebt.debtAmount).toBe("12500.5");
    expect(draftWithDebt.debtCurrency).toBe("USD");
    expect(draftWithDebt.debtDueDate).toBe("2026-11-20");
  });

  it("detects when payments form is dirty due to debt amount, currency, or due date changes", () => {
    const initial = toDraft(sampleTenant);

    const changeAmount: LimitDraft = { ...initial, debtAmount: "5000" };
    expect(isPaymentsFormDirty(changeAmount, initial)).toBe(true);

    const changeCurrency: LimitDraft = { ...initial, debtCurrency: "USD" };
    expect(isPaymentsFormDirty(changeCurrency, initial)).toBe(true);

    const changeDueDate: LimitDraft = { ...initial, debtDueDate: "2026-12-01" };
    expect(isPaymentsFormDirty(changeDueDate, initial)).toBe(true);
  });

  it("detects when debt is cleared in payments form", () => {
    const tenantWithDebt: TenantRow = {
      ...sampleTenant,
      debt_amount: 3000,
      debt_currency: "DOP",
      debt_due_date: "2026-11-15",
    };
    const initial = toDraft(tenantWithDebt);
    expect(isPaymentsFormDirty(initial, initial)).toBe(false);

    const cleared: LimitDraft = {
      ...initial,
      debtAmount: "",
      debtDueDate: "",
    };
    expect(isPaymentsFormDirty(cleared, initial)).toBe(true);
  });

  it("parses debt amount correctly and throws for negative, non-numeric, or exceeding max", () => {
    expect(parseDebtAmount("")).toBeNull();
    expect(parseDebtAmount("   ")).toBeNull();
    expect(parseDebtAmount("0")).toBe(0);
    expect(parseDebtAmount("1500.75")).toBe(1500.75);
    expect(parseDebtAmount("9999999.99")).toBe(9999999.99);

    expect(() => parseDebtAmount("-1")).toThrow();
    expect(() => parseDebtAmount("10000000")).toThrow();
    expect(() => parseDebtAmount("abc")).toThrow();
    expect(() => parseDebtAmount("Infinity")).toThrow();
  });

  it("validates ISO date format and calendar validity", () => {
    expect(isValidIsoDate("2026-11-15")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true); // leap year
    expect(isValidIsoDate("2026-02-29")).toBe(false); // non-leap year
    expect(isValidIsoDate("2026-04-31")).toBe(false); // April has 30 days
    expect(isValidIsoDate("2026-13-01")).toBe(false); // invalid month
    expect(isValidIsoDate("2026-11-00")).toBe(false); // invalid day
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("2026/11/15")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("parses debt due date and enforces required date when amount > 0", () => {
    expect(parseDebtDueDate("", null)).toBeNull();
    expect(parseDebtDueDate("", 0)).toBeNull();
    expect(parseDebtDueDate("2026-11-20", 0)).toBe("2026-11-20");

    // Amount > 0 requires date
    expect(() => parseDebtDueDate("", 100)).toThrow();
    expect(() => parseDebtDueDate("   ", 50)).toThrow();
    expect(() => parseDebtDueDate("invalid-date", 100)).toThrow();
    expect(parseDebtDueDate("2026-11-20", 100)).toBe("2026-11-20");
  });

  it("parses debt currency correctly and rejects invalid currency", () => {
    expect(parseDebtCurrency("DOP")).toBe("DOP");
    expect(parseDebtCurrency("USD")).toBe("USD");
    expect(parseDebtCurrency("dop")).toBe("DOP");
    expect(parseDebtCurrency("usd")).toBe("USD");
    expect(() => parseDebtCurrency("EUR")).toThrow();
    expect(() => parseDebtCurrency("")).toThrow();
  });

  it("validates payments draft for combined payment day and debt fields", () => {
    const validDraft: LimitDraft = {
      ...toDraft(sampleTenant),
      paymentDayOfMonth: "15",
      debtAmount: "2500.00",
      debtCurrency: "DOP",
      debtDueDate: "2026-11-30",
    };
    const validResult = validatePaymentsDraft(validDraft);
    expect(validResult.valid).toBe(true);
    expect(Object.keys(validResult.errors)).toHaveLength(0);

    // Empty debt with empty due date is valid
    const noDebtDraft: LimitDraft = {
      ...validDraft,
      debtAmount: "",
      debtDueDate: "",
    };
    expect(validatePaymentsDraft(noDebtDraft).valid).toBe(true);

    // Debt > 0 without due date is invalid
    const missingDateDraft: LimitDraft = {
      ...validDraft,
      debtAmount: "500",
      debtDueDate: "",
    };
    const missingDateResult = validatePaymentsDraft(missingDateDraft);
    expect(missingDateResult.valid).toBe(false);
    expect(missingDateResult.errors.debtDueDate).toBeTruthy();

    // Invalid amount and invalid payment day
    const invalidDraft: LimitDraft = {
      ...validDraft,
      paymentDayOfMonth: "45",
      debtAmount: "-50",
    };
    const invalidResult = validatePaymentsDraft(invalidDraft);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.paymentDayOfMonth).toBeTruthy();
    expect(invalidResult.errors.debtAmount).toBeTruthy();
  });

  describe("isDebtDraftChanged", () => {
    const baseDraft: LimitDraft = {
      ...toDraft(sampleTenant),
      debtAmount: "",
      debtCurrency: "DOP",
      debtDueDate: "",
    };

    it("returns false when unchanged", () => {
      expect(isDebtDraftChanged(baseDraft, baseDraft)).toBe(false);

      const draftWithDebt: LimitDraft = {
        ...baseDraft,
        debtAmount: "1500",
        debtCurrency: "USD",
        debtDueDate: "2026-12-01",
      };
      expect(isDebtDraftChanged(draftWithDebt, draftWithDebt)).toBe(false);
    });

    it("detects amount changed", () => {
      const modified: LimitDraft = { ...baseDraft, debtAmount: "2000" };
      expect(isDebtDraftChanged(modified, baseDraft)).toBe(true);

      const modified2: LimitDraft = {
        ...baseDraft,
        debtAmount: "500",
      };
      const initial: LimitDraft = {
        ...baseDraft,
        debtAmount: "1000",
      };
      expect(isDebtDraftChanged(modified2, initial)).toBe(true);
    });

    it("detects currency changed", () => {
      const modified: LimitDraft = { ...baseDraft, debtCurrency: "USD" };
      expect(isDebtDraftChanged(modified, baseDraft)).toBe(true);
    });

    it("detects date changed", () => {
      const initial: LimitDraft = { ...baseDraft, debtDueDate: "2026-11-20" };
      const modified: LimitDraft = { ...baseDraft, debtDueDate: "2026-11-25" };
      expect(isDebtDraftChanged(modified, initial)).toBe(true);
    });

    it("treats empty vs '0' as equal", () => {
      const emptyDraft: LimitDraft = { ...baseDraft, debtAmount: "" };
      const zeroDraft: LimitDraft = { ...baseDraft, debtAmount: "0" };
      const zeroDecimalDraft: LimitDraft = { ...baseDraft, debtAmount: "0.00" };
      const whitespaceDraft: LimitDraft = { ...baseDraft, debtAmount: "   " };

      expect(isDebtDraftChanged(emptyDraft, zeroDraft)).toBe(false);
      expect(isDebtDraftChanged(zeroDraft, emptyDraft)).toBe(false);
      expect(isDebtDraftChanged(whitespaceDraft, zeroDraft)).toBe(false);
      expect(isDebtDraftChanged(emptyDraft, zeroDecimalDraft)).toBe(false);
    });

    it("ignores whitespace in dates when comparing", () => {
      const d1: LimitDraft = { ...baseDraft, debtDueDate: "  2026-12-01  " };
      const d2: LimitDraft = { ...baseDraft, debtDueDate: "2026-12-01" };
      expect(isDebtDraftChanged(d1, d2)).toBe(false);

      const empty1: LimitDraft = { ...baseDraft, debtDueDate: "   " };
      const empty2: LimitDraft = { ...baseDraft, debtDueDate: "" };
      expect(isDebtDraftChanged(empty1, empty2)).toBe(false);
    });
  });
});
