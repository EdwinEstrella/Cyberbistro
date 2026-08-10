import { describe, expect, it } from "vitest";
import { classifyTenantAccessRows } from "./tenantAccess";
import {
  canUseOfflineTenantSession,
  createTenantSessionCacheEntry,
  getTenantSessionCacheKey,
} from "./tenantSessionCache";

describe("tenant access foundation", () => {
  it("preserves cloud, authorization, and cardinality failures instead of reporting an account as unlinked", () => {
    expect(classifyTenantAccessRows({ kind: "cloud_unavailable" })).toEqual({ status: "cloud_unavailable" });
    expect(classifyTenantAccessRows({ kind: "authorization_error" })).toEqual({ status: "authorization_error" });
    expect(classifyTenantAccessRows({ kind: "memberships", rows: [{ tenant_id: "a" }, { tenant_id: "b" }] }))
      .toEqual({ status: "cardinality_error" });
  });

  it("uses a user, tenant, and generation cache key and refuses a session at the 30-day limit", () => {
    const entry = createTenantSessionCacheEntry({
      authUserId: "user-a",
      tenantId: "tenant-a",
      generation: 3,
      validatedAt: "2026-08-01T00:00:00.000Z",
    });

    expect(getTenantSessionCacheKey(entry)).toBe("user-a:tenant-a:3");
    expect(canUseOfflineTenantSession(entry, new Date("2026-08-30T23:59:59.999Z"))).toBe(true);
    expect(canUseOfflineTenantSession(entry, new Date("2026-08-31T00:00:00.000Z"))).toBe(false);
  });
});
