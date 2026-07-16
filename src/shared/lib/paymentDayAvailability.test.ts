import { afterEach, describe, expect, it } from "vitest";
import {
  isMissingPaymentDayColumnError,
  isPaymentDayUnavailable,
  markPaymentDayUnavailable,
  resetPaymentDayAvailabilityForTests,
} from "./paymentDayAvailability";

describe("payment day rollout guard", () => {
  afterEach(() => resetPaymentDayAvailabilityForTests());

  it("recognizes the pre-migration missing-column 400", () => {
    expect(isMissingPaymentDayColumnError({
      statusCode: 400,
      message: 'column "payment_day_of_month" does not exist',
    })).toBe(true);
    expect(isMissingPaymentDayColumnError({ status: 400 })).toBe(false);
    expect(isMissingPaymentDayColumnError({ status: 400, message: "permission denied" })).toBe(false);
  });

  it("warns once and suppresses retries for a tenant during the session", () => {
    expect(markPaymentDayUnavailable("tenant-a")).toBe(true);
    expect(markPaymentDayUnavailable("tenant-a")).toBe(false);
    expect(isPaymentDayUnavailable("tenant-a")).toBe(true);
    expect(markPaymentDayUnavailable("tenant-b")).toBe(true);
  });
});
