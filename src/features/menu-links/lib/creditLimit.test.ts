import { describe, it, expect } from "vitest";
import {
  formatRD,
  formatCreditUsage,
  isCreditLimitReached,
  wouldExceedCreditLimit,
  getCreditProgressPercentage,
} from "./creditLimit";

describe("creditLimit helpers", () => {
  it("formats RD amounts correctly", () => {
    expect(formatRD(1500)).toMatch(/RD\$1,500\.00/);
    expect(formatRD(0)).toMatch(/RD\$0\.00/);
  });

  it("formats credit usage label correctly", () => {
    expect(formatCreditUsage(200, 500)).toMatch(/^Crédito usado RD\$200\.00 de RD\$500\.00$/);
    expect(formatCreditUsage(200, null)).toContain("Sin límite");
    expect(formatCreditUsage(200, undefined)).toContain("Sin límite");
  });

  it("determines when credit limit is reached", () => {
    expect(isCreditLimitReached(500, 500)).toBe(true);
    expect(isCreditLimitReached(500.01, 500)).toBe(true);
    expect(isCreditLimitReached(499.99, 500)).toBe(false);
    expect(isCreditLimitReached(1000, null)).toBe(false);
  });

  it("checks whether an order would exceed the credit limit", () => {
    expect(wouldExceedCreditLimit(400, 150, 500)).toBe(true);
    expect(wouldExceedCreditLimit(400, 100, 500)).toBe(false);
    expect(wouldExceedCreditLimit(400, 50, 500)).toBe(false);
    expect(wouldExceedCreditLimit(400, 150, null)).toBe(false);
  });

  it("computes progress percentage bounded between 0 and 100", () => {
    expect(getCreditProgressPercentage(250, 500)).toBe(50);
    expect(getCreditProgressPercentage(0, 500)).toBe(0);
    expect(getCreditProgressPercentage(600, 500)).toBe(100);
    expect(getCreditProgressPercentage(100, null)).toBe(0);
    expect(getCreditProgressPercentage(100, 0)).toBe(0);
  });
});
