import { describe, expect, it } from "vitest";
import { getBusinessToday, getBusinessIsoDow, isDatePast } from "./menuBusinessDate";

describe("menuBusinessDate", () => {
  it("formats the business today in America/Santo_Domingo (UTC-4)", () => {
    // 2026-10-31 02:00:00 UTC is 2026-10-30 22:00:00 in AST (UTC-4)
    const lateUtc = new Date("2026-10-31T02:00:00.000Z");
    expect(getBusinessToday(lateUtc)).toBe("2026-10-30");

    // 2026-10-31 14:00:00 UTC is 2026-10-31 10:00:00 in AST
    const midUtc = new Date("2026-10-31T14:00:00.000Z");
    expect(getBusinessToday(midUtc)).toBe("2026-10-31");
  });

  it("calculates ISO day of week correctly (1=Monday, 7=Sunday)", () => {
    // 2026-10-26 was a Monday
    expect(getBusinessIsoDow("2026-10-26")).toBe(1);
    // 2026-10-27 was Tuesday
    expect(getBusinessIsoDow("2026-10-27")).toBe(2);
    // 2026-10-31 was Saturday
    expect(getBusinessIsoDow("2026-10-31")).toBe(6);
    // 2026-11-01 was Sunday
    expect(getBusinessIsoDow("2026-11-01")).toBe(7);
  });

  it("checks whether a date is in the past correctly", () => {
    expect(isDatePast("2026-10-20", "2026-10-31")).toBe(true);
    expect(isDatePast("2026-10-31", "2026-10-31")).toBe(false);
    expect(isDatePast("2026-11-05", "2026-10-31")).toBe(false);
  });
});
