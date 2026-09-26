import { describe, expect, it } from "vitest";
import {
  advanceTenantAccessGeneration,
  canContinueTenantWork,
  getTenantAccessGeneration,
  shouldKeepValidatedAccess,
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

describe("shouldKeepValidatedAccess", () => {
  it("keeps a validated session when the cloud is only unreachable", () => {
    expect(shouldKeepValidatedAccess("cloud_unavailable", true)).toBe(true);
  });

  it("does not validate a session that was not validated before", () => {
    expect(shouldKeepValidatedAccess("cloud_unavailable", false)).toBe(false);
  });

  it.each(["blocked", "truly_unlinked", "authorization_error", "cardinality_error"])(
    "never masks a real access decision (%s)",
    (status) => {
      expect(shouldKeepValidatedAccess(status, true)).toBe(false);
    },
  );
});
