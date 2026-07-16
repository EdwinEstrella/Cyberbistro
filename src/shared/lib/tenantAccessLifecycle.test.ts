import { describe, expect, it } from "vitest";
import {
  advanceTenantAccessGeneration,
  canContinueTenantWork,
  getTenantAccessGeneration,
} from "./tenantAccessLifecycle";

describe("tenant access lifecycle generation", () => {
  it("invalidates protected work after a suspension without deleting data", () => {
    const tenantId = "tenant-a";
    const beforeBlock = getTenantAccessGeneration();
    expect(canContinueTenantWork(tenantId, beforeBlock)).toBe(true);
    advanceTenantAccessGeneration();
    expect(canContinueTenantWork(tenantId, beforeBlock)).toBe(false);
  });

  it("allows newly validated work after unblock", () => {
    const generation = advanceTenantAccessGeneration();
    expect(canContinueTenantWork("tenant-a", generation)).toBe(true);
  });
});
