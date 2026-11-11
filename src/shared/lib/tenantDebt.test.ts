import { describe, expect, it } from "vitest";
import {
  buildDebtMessage,
  DEBT_GRACE_DAYS,
  formatDebtAmount,
  getDebtAlertStorageKey,
  getDebtStatus,
  toTenantDebt,
  type TenantDebt,
} from "./tenantDebt";

describe("DEBT_GRACE_DAYS", () => {
  it("equals 3", () => {
    expect(DEBT_GRACE_DAYS).toBe(3);
  });
});

describe("getDebtAlertStorageKey", () => {
  it("builds the expected localStorage key with tenantId, kind, and dateKey", () => {
    expect(getDebtAlertStorageKey("tenant-1", "upcoming", "2026-11-12")).toBe(
      "debt-alert:tenant-1:upcoming:2026-11-12"
    );
  });
});

describe("getDebtStatus", () => {
  const baseDebt: TenantDebt = {
    amount: 5000,
    currency: "DOP",
    dueDate: "2026-11-12",
  };

  describe("none cases", () => {
    it("returns none when amount is null", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, amount: null })).toEqual({ kind: "none" });
    });

    it("returns none when amount is 0", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, amount: 0 })).toEqual({ kind: "none" });
    });

    it("returns none when amount is negative", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, amount: -150 })).toEqual({ kind: "none" });
    });

    it("returns none when amount is NaN", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, amount: Number.NaN })).toEqual({ kind: "none" });
    });

    it("returns none when amount is infinite", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, amount: Infinity })).toEqual({ kind: "none" });
    });

    it("returns none when dueDate is null", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: null })).toEqual({ kind: "none" });
    });

    it("returns none when dueDate has invalid format or characters", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026-11-1" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "not-a-date" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026/11/12" })).toEqual({ kind: "none" });
    });

    it("returns none when dueDate is an impossible calendar date", () => {
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026-02-30" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026-04-31" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026-13-01" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026-00-10" })).toEqual({ kind: "none" });
      expect(getDebtStatus(new Date(2026, 10, 12), { ...baseDebt, dueDate: "2026-02-29" })).toEqual({ kind: "none" }); // non-leap
    });

    it("returns none when due date is 2 or more days in the future (no early noise)", () => {
      // 2 days before due date
      expect(getDebtStatus(new Date(2026, 10, 10), baseDebt)).toEqual({ kind: "none" });
      // 10 days before due date
      expect(getDebtStatus(new Date(2026, 10, 2), baseDebt)).toEqual({ kind: "none" });
    });
  });

  describe("status boundaries", () => {
    it("returns upcoming when due date is exactly 1 day away", () => {
      // Due 2026-11-12, today 2026-11-11
      expect(getDebtStatus(new Date(2026, 10, 11), baseDebt)).toEqual({
        kind: "upcoming",
        daysLeft: 1,
      });
    });

    it("returns due_today on the due date", () => {
      // Due 2026-11-12, today 2026-11-12
      expect(getDebtStatus(new Date(2026, 10, 12), baseDebt)).toEqual({
        kind: "due_today",
      });
    });

    it("returns overdue for 1 day after due date with lockDate = dueDate + 3 days", () => {
      // Due 2026-11-12, today 2026-11-13 (+1 day)
      expect(getDebtStatus(new Date(2026, 10, 13), baseDebt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2026-11-15",
      });
    });

    it("returns overdue for 2 days after due date with lockDate = dueDate + 3 days", () => {
      // Due 2026-11-12, today 2026-11-14 (+2 days)
      expect(getDebtStatus(new Date(2026, 10, 14), baseDebt)).toEqual({
        kind: "overdue",
        daysOverdue: 2,
        lockDate: "2026-11-15",
      });
    });

    it("returns locked at +3 days after due date (DEBT_GRACE_DAYS threshold)", () => {
      // Due 2026-11-12, today 2026-11-15 (+3 days)
      expect(getDebtStatus(new Date(2026, 10, 15), baseDebt)).toEqual({
        kind: "locked",
        daysOverdue: 3,
      });
    });

    it("returns locked at +10 days after due date", () => {
      // Due 2026-11-12, today 2026-11-22 (+10 days)
      expect(getDebtStatus(new Date(2026, 10, 22), baseDebt)).toEqual({
        kind: "locked",
        daysOverdue: 10,
      });
    });
  });

  describe("time-of-day and DST safety", () => {
    it("handles today near start or end of day identically", () => {
      const morning = new Date(2026, 10, 11, 0, 0, 1);
      const night = new Date(2026, 10, 11, 23, 59, 59);

      expect(getDebtStatus(morning, baseDebt)).toEqual({ kind: "upcoming", daysLeft: 1 });
      expect(getDebtStatus(night, baseDebt)).toEqual({ kind: "upcoming", daysLeft: 1 });
    });
  });

  describe("lockDate across month, year, and leap-year boundaries", () => {
    it("computes lockDate across month boundary (Jan 30 -> Feb 02)", () => {
      const debt: TenantDebt = { amount: 100, currency: "USD", dueDate: "2026-01-30" };
      // +1 day overdue on 2026-01-31
      expect(getDebtStatus(new Date(2026, 0, 31), debt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2026-02-02",
      });
    });

    it("computes lockDate across 30-day month boundary (Apr 30 -> May 03)", () => {
      const debt: TenantDebt = { amount: 100, currency: "USD", dueDate: "2026-04-30" };
      // +1 day overdue on 2026-05-01
      expect(getDebtStatus(new Date(2026, 4, 1), debt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2026-05-03",
      });
    });

    it("computes lockDate across year boundary (Dec 30 -> Jan 02 next year)", () => {
      const debt: TenantDebt = { amount: 100, currency: "USD", dueDate: "2026-12-30" };
      // +1 day overdue on 2026-12-31
      expect(getDebtStatus(new Date(2026, 11, 31), debt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2027-01-02",
      });
    });

    it("computes lockDate in leap year (Feb 27, 2028 -> Mar 01, 2028)", () => {
      const debt: TenantDebt = { amount: 100, currency: "USD", dueDate: "2028-02-27" };
      // +1 day overdue on 2028-02-28
      expect(getDebtStatus(new Date(2028, 1, 28), debt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2028-03-01",
      });
    });

    it("computes lockDate in leap day (Feb 29, 2028 -> Mar 03, 2028)", () => {
      const debt: TenantDebt = { amount: 100, currency: "USD", dueDate: "2028-02-29" };
      // +1 day overdue on 2028-03-01
      expect(getDebtStatus(new Date(2028, 2, 1), debt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2028-03-03",
      });
    });

    it("computes lockDate in non-leap year (Feb 27, 2026 -> Mar 02, 2026)", () => {
      const debt: TenantDebt = { amount: 100, currency: "USD", dueDate: "2026-02-27" };
      // +1 day overdue on 2026-02-28
      expect(getDebtStatus(new Date(2026, 1, 28), debt)).toEqual({
        kind: "overdue",
        daysOverdue: 1,
        lockDate: "2026-03-02",
      });
    });
  });
});

describe("formatDebtAmount", () => {
  it("formats DOP with RD$ prefix and two decimals", () => {
    expect(formatDebtAmount(5000, "DOP")).toBe("RD$ 5,000.00");
    expect(formatDebtAmount(0, "DOP")).toBe("RD$ 0.00");
  });

  it("formats USD with US$ prefix and two decimals", () => {
    expect(formatDebtAmount(50, "USD")).toBe("US$ 50.00");
    expect(formatDebtAmount(12.5, "USD")).toBe("US$ 12.50");
  });

  it("applies thousands separators correctly", () => {
    expect(formatDebtAmount(1234567.89, "DOP")).toBe("RD$ 1,234,567.89");
    expect(formatDebtAmount(1000000, "USD")).toBe("US$ 1,000,000.00");
  });

  it("rounds amounts to two decimal places", () => {
    expect(formatDebtAmount(5000.554, "DOP")).toBe("RD$ 5,000.55");
    expect(formatDebtAmount(5000.556, "DOP")).toBe("RD$ 5,000.56");
    expect(formatDebtAmount(50.006, "USD")).toBe("US$ 50.01");
  });
});

describe("buildDebtMessage", () => {
  const baseDebt: TenantDebt = {
    amount: 5000,
    currency: "DOP",
    dueDate: "2026-11-12",
  };

  it("returns null when status is none", () => {
    expect(
      buildDebtMessage({
        businessName: "Bistro Central",
        debt: baseDebt,
        status: { kind: "none" },
      })
    ).toBeNull();
  });

  it("builds exact upcoming reminder string with em dash", () => {
    const result = buildDebtMessage({
      businessName: "Bistro Central",
      debt: baseDebt,
      status: { kind: "upcoming", daysLeft: 1 },
    });

    expect(result).toEqual({
      title: "Recordatorio de pago",
      message:
        "Por favor pagar Bistro Central — RD$ 5,000.00 — para continuar con el servicio sin interrupciones. Vence mañana.",
    });
  });

  it("builds exact due_today reminder string with em dash", () => {
    const result = buildDebtMessage({
      businessName: "Bistro Central",
      debt: baseDebt,
      status: { kind: "due_today" },
    });

    expect(result).toEqual({
      title: "Recordatorio de pago",
      message:
        "Por favor pagar Bistro Central — RD$ 5,000.00 — para continuar con el servicio sin interrupciones. Vence hoy.",
    });
  });

  it("builds exact overdue string with em dash and lockDate formatted DD/MM/YYYY", () => {
    const result = buildDebtMessage({
      businessName: "Bistro Central",
      debt: baseDebt,
      status: { kind: "overdue", daysOverdue: 1, lockDate: "2026-11-15" },
    });

    expect(result).toEqual({
      title: "Pago vencido",
      message:
        "Por favor pagar Bistro Central — RD$ 5,000.00 — para continuar con el servicio sin interrupciones. Si no se recibe el pago el 15/11/2026, el sistema se deshabilitará.",
    });
  });

  it("builds exact locked string with parentheses and support notice", () => {
    const result = buildDebtMessage({
      businessName: "Bistro Central",
      debt: baseDebt,
      status: { kind: "locked", daysOverdue: 3 },
    });

    expect(result).toEqual({
      title: "Servicio deshabilitado",
      message:
        "El servicio de Bistro Central está deshabilitado por pago pendiente (RD$ 5,000.00). Contactá a soporte para reactivarlo.",
    });
  });

  describe("empty and whitespace businessName fallback", () => {
    it("falls back to 'tu negocio' when businessName is empty", () => {
      const result = buildDebtMessage({
        businessName: "",
        debt: baseDebt,
        status: { kind: "upcoming", daysLeft: 1 },
      });

      expect(result).toEqual({
        title: "Recordatorio de pago",
        message:
          "Por favor pagar tu negocio — RD$ 5,000.00 — para continuar con el servicio sin interrupciones. Vence mañana.",
      });
    });

    it("falls back to 'tu negocio' when businessName contains only whitespace", () => {
      const result = buildDebtMessage({
        businessName: "   ",
        debt: { amount: 50, currency: "USD", dueDate: "2026-11-12" },
        status: { kind: "locked", daysOverdue: 4 },
      });

      expect(result).toEqual({
        title: "Servicio deshabilitado",
        message:
          "El servicio de tu negocio está deshabilitado por pago pendiente (US$ 50.00). Contactá a soporte para reactivarlo.",
      });
    });

    it("trims surrounding whitespace from businessName", () => {
      const result = buildDebtMessage({
        businessName: "  Restaurante El Valle  ",
        debt: baseDebt,
        status: { kind: "due_today" },
      });

      expect(result).toEqual({
        title: "Recordatorio de pago",
        message:
          "Por favor pagar Restaurante El Valle — RD$ 5,000.00 — para continuar con el servicio sin interrupciones. Vence hoy.",
      });
    });
  });
});

describe("toTenantDebt", () => {
  it("returns null amount and default DOP currency on null or non-object input", () => {
    expect(toTenantDebt(null)).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt(undefined)).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt("string")).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt(123)).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt([])).toEqual({ amount: null, currency: "DOP", dueDate: null });
  });

  it("returns null amount when debt_amount is missing or empty object", () => {
    expect(toTenantDebt({})).toEqual({ amount: null, currency: "DOP", dueDate: null });
  });

  it("returns null amount when debt_amount is zero or negative", () => {
    expect(toTenantDebt({ debt_amount: 0 })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: -500 })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: "0" })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: "-200.50" })).toEqual({ amount: null, currency: "DOP", dueDate: null });
  });

  it("returns null amount when debt_amount is non-numeric or invalid", () => {
    expect(toTenantDebt({ debt_amount: null })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: undefined })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: Number.NaN })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: Infinity })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: "abc" })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: "" })).toEqual({ amount: null, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: "   " })).toEqual({ amount: null, currency: "DOP", dueDate: null });
  });

  it("parses valid positive number and string amounts", () => {
    expect(toTenantDebt({ debt_amount: 2500 })).toEqual({ amount: 2500, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: "3450.75" })).toEqual({ amount: 3450.75, currency: "DOP", dueDate: null });
    expect(toTenantDebt({ debt_amount: " 1000 " })).toEqual({ amount: 1000, currency: "DOP", dueDate: null });
  });

  it("maps currency to USD when specified, defaulting to DOP otherwise", () => {
    expect(toTenantDebt({ debt_amount: 50, debt_currency: "USD" })).toEqual({
      amount: 50,
      currency: "USD",
      dueDate: null,
    });
    expect(toTenantDebt({ debt_amount: 50, debt_currency: "usd" })).toEqual({
      amount: 50,
      currency: "USD",
      dueDate: null,
    });
    expect(toTenantDebt({ debt_amount: 50, debt_currency: "EUR" })).toEqual({
      amount: 50,
      currency: "DOP",
      dueDate: null,
    });
    expect(toTenantDebt({ debt_amount: 50, debt_currency: null })).toEqual({
      amount: 50,
      currency: "DOP",
      dueDate: null,
    });
  });

  it("parses valid ISO due date, discarding invalid dates", () => {
    expect(toTenantDebt({ debt_amount: 100, debt_due_date: "2026-11-20" })).toEqual({
      amount: 100,
      currency: "DOP",
      dueDate: "2026-11-20",
    });
    expect(toTenantDebt({ debt_amount: 100, debt_due_date: "invalid-date" })).toEqual({
      amount: 100,
      currency: "DOP",
      dueDate: null,
    });
    expect(toTenantDebt({ debt_amount: 100, debt_due_date: "2026-02-30" })).toEqual({
      amount: 100,
      currency: "DOP",
      dueDate: null,
    });
  });
});
