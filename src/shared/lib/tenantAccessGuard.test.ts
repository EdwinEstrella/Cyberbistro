import { describe, expect, it } from "vitest";
import { canCommitTenantAsyncState } from "./tenantAccessGuard";

describe("tenant async state guard", () => {
  it("rejects a late tenant-A branch response after tenant-B transition", () => {
    expect(canCommitTenantAsyncState({
      requestGeneration: 1,
      currentGeneration: 2,
      requestTenantId: "tenant-a",
      currentTenantId: "tenant-b",
      accessValidated: true,
    })).toBe(false);
  });

  it("rejects stale payment lookups after access denial", () => {
    expect(canCommitTenantAsyncState({
      requestGeneration: 4,
      currentGeneration: 4,
      requestTenantId: "tenant-a",
      currentTenantId: "tenant-a",
      accessValidated: false,
    })).toBe(false);
  });
});
