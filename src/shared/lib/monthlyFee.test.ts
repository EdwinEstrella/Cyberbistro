import { describe, expect, it } from "vitest";
import {
  billingDatesBetween,
  clampBillingDate,
  formatBillingDateDisplay,
  latestBillingDateOnOrBefore,
  nextBillingDateAfter,
} from "./monthlyFee";

describe("monthlyFee date math", () => {
  describe("clampBillingDate", () => {
    it("preserves valid days in standard months", () => {
      expect(clampBillingDate(2026, 11, 13)).toBe("2026-11-13");
      expect(clampBillingDate(2026, 1, 1)).toBe("2026-01-01");
      expect(clampBillingDate(2026, 12, 31)).toBe("2026-12-31");
    });

    it("clamps day 31 to 30 in 30-day months", () => {
      expect(clampBillingDate(2026, 4, 31)).toBe("2026-04-30");
      expect(clampBillingDate(2026, 6, 31)).toBe("2026-06-30");
      expect(clampBillingDate(2026, 9, 31)).toBe("2026-09-30");
      expect(clampBillingDate(2026, 11, 31)).toBe("2026-11-30");
    });

    it("clamps day 31 to 28 in non-leap February", () => {
      expect(clampBillingDate(2026, 2, 31)).toBe("2026-02-28");
      expect(clampBillingDate(2026, 2, 29)).toBe("2026-02-28");
    });

    it("clamps day 31 to 29 in leap February", () => {
      expect(clampBillingDate(2024, 2, 31)).toBe("2024-02-29");
      expect(clampBillingDate(2024, 2, 30)).toBe("2024-02-29");
    });

    it("validates input ranges", () => {
      expect(() => clampBillingDate(2026, 0, 15)).toThrow(RangeError);
      expect(() => clampBillingDate(2026, 13, 15)).toThrow(RangeError);
      expect(() => clampBillingDate(2026, 5, 0)).toThrow(RangeError);
      expect(() => clampBillingDate(2026, 5, 32)).toThrow(RangeError);
    });
  });

  describe("latestBillingDateOnOrBefore", () => {
    it("returns this month billing date if on or before asOf (anchor rule test case: 2026-11-19, day 13 -> 2026-11-13)", () => {
      expect(latestBillingDateOnOrBefore(13, "2026-11-19")).toBe("2026-11-13");
    });

    it("returns previous month billing date if this month billing date is after asOf", () => {
      expect(latestBillingDateOnOrBefore(25, "2026-11-19")).toBe("2026-10-25");
    });

    it("returns today when today is the exact billing date", () => {
      expect(latestBillingDateOnOrBefore(13, "2026-11-13")).toBe("2026-11-13");
    });

    it("rolls back across year boundaries (Jan 10 with day 15 -> Dec 15 of prior year)", () => {
      expect(latestBillingDateOnOrBefore(15, "2026-01-10")).toBe("2025-12-15");
    });

    it("clamps day 31 when rolling back to February", () => {
      expect(latestBillingDateOnOrBefore(31, "2026-03-30")).toBe("2026-02-28");
    });

    it("accepts Date instances correctly", () => {
      const date = new Date(2026, 10, 19); // 2026-11-19 in local time
      expect(latestBillingDateOnOrBefore(13, date)).toBe("2026-11-13");
    });
  });

  describe("nextBillingDateAfter", () => {
    it("returns next month when billing date of this month is past (today 2026-11-19, day 13 -> 2026-12-13)", () => {
      expect(nextBillingDateAfter(13, "2026-11-19")).toBe("2026-12-13");
    });

    it("returns this month when billing date is upcoming (today 2026-11-19, day 25 -> 2026-11-25)", () => {
      expect(nextBillingDateAfter(25, "2026-11-19")).toBe("2026-11-25");
    });

    it("returns next month when passed the exact current billing date", () => {
      expect(nextBillingDateAfter(13, "2026-11-13")).toBe("2026-12-13");
    });

    it("rolls over across December into January", () => {
      expect(nextBillingDateAfter(15, "2026-12-20")).toBe("2027-01-15");
    });
  });

  describe("billingDatesBetween", () => {
    it("returns empty array when no billing date falls strictly between afterDate and onOrBeforeDate (2026-11-13 to 2026-11-30 charges 0)", () => {
      expect(billingDatesBetween(13, "2026-11-13", "2026-11-30")).toEqual([]);
    });

    it("charges 1 cycle on the next payment day (2026-11-13 to 2026-12-13)", () => {
      expect(billingDatesBetween(13, "2026-11-13", "2026-12-13")).toEqual(["2026-12-13"]);
    });

    it("charges 3 cycles over 3 months (2026-11-13 to 2027-02-13)", () => {
      expect(billingDatesBetween(13, "2026-11-13", "2027-02-13")).toEqual([
        "2026-12-13",
        "2027-01-13",
        "2027-02-13",
      ]);
    });

    it("is idempotent: accrual on the same day yields 0 new cycles", () => {
      expect(billingDatesBetween(13, "2026-12-13", "2026-12-13")).toEqual([]);
    });

    it("correctly clamps short months during accumulation (day 31 from Jan 31 to Mar 31)", () => {
      expect(billingDatesBetween(31, "2026-01-31", "2026-03-31")).toEqual([
        "2026-02-28",
        "2026-03-31",
      ]);
    });

    it("returns empty array if afterDate is on or after onOrBeforeDate", () => {
      expect(billingDatesBetween(13, "2027-05-15", "2027-05-10")).toEqual([]);
    });
  });

  describe("formatBillingDateDisplay", () => {
    it("formats dates with Spanish short month names", () => {
      expect(formatBillingDateDisplay("2026-12-13")).toBe("13 dic");
      expect(formatBillingDateDisplay("2026-01-01")).toBe("1 ene");
      expect(formatBillingDateDisplay("2026-02-28")).toBe("28 feb");
    });
  });
});
