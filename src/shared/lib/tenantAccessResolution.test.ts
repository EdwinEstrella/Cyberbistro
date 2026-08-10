import { describe, expect, it } from "vitest";
import { classifyTenantMembershipResolution } from "./tenantAccess";

describe("tenant membership resolution", () => {
  it("keeps authorization, cloud, and cardinality failures distinct from an unlinked account", () => {
    expect(classifyTenantMembershipResolution({ kind: "authorization_error" })).toEqual({ status: "authorization_error" });
    expect(classifyTenantMembershipResolution({ kind: "cloud_unavailable" })).toEqual({ status: "cloud_unavailable" });
    expect(classifyTenantMembershipResolution({
      kind: "memberships",
      rows: [{ tenant_id: "tenant-a" }, { tenant_id: "tenant-b" }],
    })).toEqual({ status: "cardinality_error" });
  });

  it("returns truly_unlinked only for a successful empty membership response and preserves blocked membership", () => {
    expect(classifyTenantMembershipResolution({ kind: "memberships", rows: [] }))
      .toEqual({ status: "truly_unlinked" });
    expect(classifyTenantMembershipResolution({
      kind: "memberships",
      rows: [{ tenant_id: "tenant-a", activo: false }],
    })).toEqual({ status: "blocked", tenantId: "tenant-a" });
  });
});
