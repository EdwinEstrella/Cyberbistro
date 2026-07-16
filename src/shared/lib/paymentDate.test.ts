import { describe, expect, it } from "vitest";
import { clampPaymentDate, formatLocalDateKey, getPaymentAlert, getPaymentAlertStorageKey } from "./paymentDate";

describe("clampPaymentDate", () => {
  it("clamps day 31 to day 30 in April", () => {
    expect(formatLocalDateKey(clampPaymentDate(31, 3, 2026))).toBe("2026-04-30");
  });

  it("clamps day 31 to February 28 in a non-leap year", () => {
    expect(formatLocalDateKey(clampPaymentDate(31, 1, 2026))).toBe("2026-02-28");
  });

  it("keeps day 29 in a leap-year February", () => {
    expect(formatLocalDateKey(clampPaymentDate(29, 1, 2028))).toBe("2028-02-29");
  });

  it("returns reminder and payment-day alert windows", () => {
    expect(getPaymentAlert(new Date(2026, 3, 29), 31)).toEqual({ kind: "reminder", dateKey: "2026-04-29" });
    expect(getPaymentAlert(new Date(2026, 3, 30), 31)).toEqual({ kind: "today", dateKey: "2026-04-30" });
    expect(getPaymentAlert(new Date(2026, 3, 15), null)).toBeNull();
  });

  it("scopes dismissal keys to the tenant", () => {
    expect(getPaymentAlertStorageKey("tenant-a", "2026-04-30")).toBe("payment-alert:tenant-a:2026-04-30");
    expect(getPaymentAlertStorageKey("tenant-a", "2026-04-30")).not.toBe(
      getPaymentAlertStorageKey("tenant-b", "2026-04-30")
    );
  });
});
