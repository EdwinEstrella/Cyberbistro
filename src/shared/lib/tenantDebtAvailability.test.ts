import { beforeEach, describe, expect, it } from "vitest";
import {
  isDebtColumnsUnavailable,
  isMissingDebtColumnsError,
  markDebtColumnsUnavailable,
  resetDebtColumnsAvailabilityForTests,
} from "./tenantDebtAvailability";

describe("tenant debt availability rollout guard", () => {
  beforeEach(() => {
    resetDebtColumnsAvailabilityForTests();
  });

  it("detects missing debt schema errors across different error shapes", () => {
    expect(
      isMissingDebtColumnsError({
        code: "42703",
        message: 'column "debt_amount" does not exist',
        status: 400,
      })
    ).toBe(true);

    expect(
      isMissingDebtColumnsError({
        details: "Could not find the 'debt_due_date' column of 'tenants' in the schema cache",
        status: 400,
      })
    ).toBe(true);

    expect(
      isMissingDebtColumnsError({
        message: "column tenants.debt_currency does not exist",
      })
    ).toBe(true);

    expect(
      isMissingDebtColumnsError({
        code: "42703",
        message: 'column "monthly_fee_amount" does not exist',
        status: 400,
      })
    ).toBe(true);

    expect(
      isMissingDebtColumnsError({
        details: "Could not find the 'monthly_fee_currency' column of 'tenants' in the schema cache",
        status: 400,
      })
    ).toBe(true);

    expect(
      isMissingDebtColumnsError({
        message: "column tenants.last_charged_period does not exist",
      })
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isMissingDebtColumnsError(null)).toBe(false);
    expect(isMissingDebtColumnsError({ status: 400 })).toBe(false);
    expect(isMissingDebtColumnsError({ status: 400, message: "permission denied" })).toBe(false);
    expect(isMissingDebtColumnsError({ message: 'column "unknown_col" does not exist' })).toBe(false);
  });

  it("marks tenants as unavailable and warns only once", () => {
    expect(isDebtColumnsUnavailable("tenant-1")).toBe(false);
    expect(markDebtColumnsUnavailable("tenant-1")).toBe(true);
    expect(isDebtColumnsUnavailable("tenant-1")).toBe(true);
    expect(markDebtColumnsUnavailable("tenant-1")).toBe(false);
  });
});
