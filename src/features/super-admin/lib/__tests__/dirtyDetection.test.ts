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
  resolveDebtDueDate,
  isValidIsoDate,
  formatIsoDateDisplay,
  isDebtDraftChanged,
  parseMonthlyFeeAmount,
  isMonthlyFeeConfigChanged,
  normalizePaymentDay,
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

  describe("formatIsoDateDisplay", () => {
    it("formats ISO date YYYY-MM-DD to DD/MM/YYYY", () => {
      expect(formatIsoDateDisplay("2026-11-12")).toBe("12/11/2026");
      expect(formatIsoDateDisplay("2025-01-05")).toBe("05/01/2025");
    });

    it("trims surrounding whitespace before formatting", () => {
      expect(formatIsoDateDisplay("  2026-11-12  ")).toBe("12/11/2026");
    });

    it("returns empty string for empty or whitespace-only input", () => {
      expect(formatIsoDateDisplay("")).toBe("");
      expect(formatIsoDateDisplay("   ")).toBe("");
    });

    it("returns input string when format does not match ISO date", () => {
      expect(formatIsoDateDisplay("not-an-iso-date")).toBe("not-an-iso-date");
    });
  });

  describe("resolveDebtDueDate", () => {
    const fixedToday = new Date(2026, 10, 12, 14, 30, 0); // Local date 2026-11-12

    it("returns null when there is no debt (null, 0, or negative)", () => {
      expect(
        resolveDebtDueDate({
          amount: null,
          existingDueDate: "2026-11-20",
          hadSavedDebt: true,
          today: fixedToday,
        })
      ).toBeNull();

      expect(
        resolveDebtDueDate({
          amount: 0,
          existingDueDate: "2026-11-20",
          hadSavedDebt: true,
          today: fixedToday,
        })
      ).toBeNull();

      expect(
        resolveDebtDueDate({
          amount: -50,
          existingDueDate: "2026-11-20",
          hadSavedDebt: true,
          today: fixedToday,
        })
      ).toBeNull();
    });

    it("resolves to today's local date for a new debt", () => {
      expect(
        resolveDebtDueDate({
          amount: 1500,
          existingDueDate: "",
          hadSavedDebt: false,
          today: fixedToday,
        })
      ).toBe("2026-11-12");
    });

    it("keeps existing due date for an existing debt with a valid ISO date", () => {
      expect(
        resolveDebtDueDate({
          amount: 2500,
          existingDueDate: "2026-11-05",
          hadSavedDebt: true,
          today: fixedToday,
        })
      ).toBe("2026-11-05");
    });

    it("defaults to today when hadSavedDebt is false even if a stale date is present", () => {
      expect(
        resolveDebtDueDate({
          amount: 3000,
          existingDueDate: "2026-10-01",
          hadSavedDebt: false,
          today: fixedToday,
        })
      ).toBe("2026-11-12");
    });

    it("defaults to today when existing date is invalid even if hadSavedDebt was true", () => {
      expect(
        resolveDebtDueDate({
          amount: 1200,
          existingDueDate: "not-a-valid-date",
          hadSavedDebt: true,
          today: fixedToday,
        })
      ).toBe("2026-11-12");

      expect(
        resolveDebtDueDate({
          amount: 1200,
          existingDueDate: "",
          hadSavedDebt: true,
          today: fixedToday,
        })
      ).toBe("2026-11-12");
    });
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

    // Debt without manual due date is valid because due date is auto-resolved on save
    const debtWithoutManualDate: LimitDraft = {
      ...validDraft,
      debtAmount: "500",
      debtDueDate: "",
    };
    const withoutManualDateResult = validatePaymentsDraft(debtWithoutManualDate);
    expect(withoutManualDateResult.valid).toBe(true);
    expect(Object.keys(withoutManualDateResult.errors)).toHaveLength(0);

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

  describe("monthly fee draft handling and validation", () => {
    it("converts tenant with monthly fee to initial draft", () => {
      const tenantWithFee: TenantRow = {
        ...sampleTenant,
        monthly_fee_amount: 1500,
        monthly_fee_currency: "USD",
        last_charged_period: "2026-11-13",
      };
      const draft = toDraft(tenantWithFee);
      expect(draft.monthlyFeeAmount).toBe("1500");
      expect(draft.monthlyFeeCurrency).toBe("USD");
    });

    it("parses monthly fee amount correctly and throws for negative, non-numeric, or exceeding max", () => {
      expect(parseMonthlyFeeAmount("")).toBeNull();
      expect(parseMonthlyFeeAmount("   ")).toBeNull();
      expect(parseMonthlyFeeAmount("0")).toBe(0);
      expect(parseMonthlyFeeAmount("1500.50")).toBe(1500.5);
      expect(parseMonthlyFeeAmount("9999999.99")).toBe(9999999.99);

      expect(() => parseMonthlyFeeAmount("-1")).toThrow();
      expect(() => parseMonthlyFeeAmount("10000000")).toThrow();
      expect(() => parseMonthlyFeeAmount("abc")).toThrow();
    });

    it("detects when payments form is dirty due to monthly fee changes", () => {
      const initial = toDraft(sampleTenant);

      const changeFeeAmount: LimitDraft = { ...initial, monthlyFeeAmount: "2500" };
      expect(isPaymentsFormDirty(changeFeeAmount, initial)).toBe(true);

      const changeFeeCurrency: LimitDraft = { ...initial, monthlyFeeCurrency: "USD" };
      expect(isPaymentsFormDirty(changeFeeCurrency, initial)).toBe(true);
    });

    it("detects when monthly fee configuration changed", () => {
      const initial = toDraft(sampleTenant);
      expect(isMonthlyFeeConfigChanged(initial, initial)).toBe(false);

      const changedAmount: LimitDraft = { ...initial, monthlyFeeAmount: "1200" };
      expect(isMonthlyFeeConfigChanged(changedAmount, initial)).toBe(true);

      const changedCurrency: LimitDraft = { ...initial, monthlyFeeCurrency: "USD" };
      expect(isMonthlyFeeConfigChanged(changedCurrency, initial)).toBe(true);

      const changedDay: LimitDraft = { ...initial, paymentDayOfMonth: "25" };
      expect(isMonthlyFeeConfigChanged(changedDay, initial)).toBe(true);
    });

    it("does not report change when fee amount only differs in formatting ('1500' vs '1500.00')", () => {
      const initial: LimitDraft = {
        ...toDraft(sampleTenant),
        monthlyFeeAmount: "1500",
        paymentDayOfMonth: "15",
      };
      const formatted: LimitDraft = {
        ...initial,
        monthlyFeeAmount: "1500.00",
      };
      expect(isMonthlyFeeConfigChanged(formatted, initial)).toBe(false);
      expect(isMonthlyFeeConfigChanged(initial, formatted)).toBe(false);
    });

    it("does not report change when payment day only differs in padding or whitespace", () => {
      const initial: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "5",
        monthlyFeeAmount: "1500",
      };
      const padded: LimitDraft = {
        ...initial,
        paymentDayOfMonth: "05",
      };
      const spaced: LimitDraft = {
        ...initial,
        paymentDayOfMonth: "  5  ",
      };
      expect(isMonthlyFeeConfigChanged(padded, initial)).toBe(false);
      expect(isMonthlyFeeConfigChanged(spaced, initial)).toBe(false);
    });

    it("normalizes payment day strings correctly", () => {
      expect(normalizePaymentDay("5")).toBe(5);
      expect(normalizePaymentDay("05")).toBe(5);
      expect(normalizePaymentDay(" 15 ")).toBe(15);
      expect(normalizePaymentDay("")).toBeNull();
      expect(normalizePaymentDay("   ")).toBeNull();
      expect(normalizePaymentDay("0")).toBeNull();
      expect(normalizePaymentDay("32")).toBeNull();
      expect(normalizePaymentDay("abc")).toBeNull();
    });

    it("requires payment day when fee > 0 in validatePaymentsDraft", () => {
      const draftWithFeeNoDay: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "",
        monthlyFeeAmount: "1500",
        monthlyFeeCurrency: "DOP",
      };
      const result = validatePaymentsDraft(draftWithFeeNoDay);
      expect(result.valid).toBe(false);
      expect(result.errors.paymentDayOfMonth).toBe(
        "El día de pago es obligatorio cuando se configura una cuota mensual."
      );
    });

    it("rejects currency mismatch between fee and outstanding debt", () => {
      const mismatchedDraft: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "15",
        monthlyFeeAmount: "1500",
        monthlyFeeCurrency: "USD",
        debtAmount: "3000",
        debtCurrency: "DOP",
      };
      const result = validatePaymentsDraft(mismatchedDraft);
      expect(result.valid).toBe(false);
      expect(result.errors.debtCurrency).toBe(
        "La moneda del saldo debe ser la misma de la cuota mensual."
      );
    });

    it("rejects currency mismatch when fee > 0 even if balance is 0 or empty", () => {
      const zeroBalanceMismatched: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "15",
        monthlyFeeAmount: "1500",
        monthlyFeeCurrency: "USD",
        debtAmount: "0",
        debtCurrency: "DOP",
      };
      const resultZero = validatePaymentsDraft(zeroBalanceMismatched);
      expect(resultZero.valid).toBe(false);
      expect(resultZero.errors.debtCurrency).toBe(
        "La moneda del saldo debe ser la misma de la cuota mensual."
      );

      const emptyBalanceMismatched: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "15",
        monthlyFeeAmount: "1500",
        monthlyFeeCurrency: "USD",
        debtAmount: "",
        debtCurrency: "DOP",
      };
      const resultEmpty = validatePaymentsDraft(emptyBalanceMismatched);
      expect(resultEmpty.valid).toBe(false);
      expect(resultEmpty.errors.debtCurrency).toBe(
        "La moneda del saldo debe ser la misma de la cuota mensual."
      );
    });

    it("allows any debt currency when there is no monthly fee configured", () => {
      const noFeeDraft: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "",
        monthlyFeeAmount: "",
        monthlyFeeCurrency: "USD",
        debtAmount: "2500",
        debtCurrency: "DOP",
      };
      const result = validatePaymentsDraft(noFeeDraft);
      expect(result.valid).toBe(true);
      expect(result.errors.debtCurrency).toBeUndefined();

      const zeroFeeDraft: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "",
        monthlyFeeAmount: "0",
        monthlyFeeCurrency: "USD",
        debtAmount: "2500",
        debtCurrency: "DOP",
      };
      const resultZero = validatePaymentsDraft(zeroFeeDraft);
      expect(resultZero.valid).toBe(true);
      expect(resultZero.errors.debtCurrency).toBeUndefined();
    });

    it("accepts valid draft with matching fee and debt currencies", () => {
      const validMatchingDraft: LimitDraft = {
        ...toDraft(sampleTenant),
        paymentDayOfMonth: "15",
        monthlyFeeAmount: "1500",
        monthlyFeeCurrency: "DOP",
        debtAmount: "3000",
        debtCurrency: "DOP",
      };
      const result = validatePaymentsDraft(validMatchingDraft);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });
});
