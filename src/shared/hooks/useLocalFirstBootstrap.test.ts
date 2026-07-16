import { describe, expect, it } from "vitest";
import { canStartProtectedTenantWork, resolveLicenseGateForOnlineSync } from "./useLocalFirstBootstrap";

describe("useLocalFirstBootstrap license gate", () => {
  it("blocks online sync when license validation is not valid", () => {
    const result = resolveLicenseGateForOnlineSync({ valid: false, reason: "Tenant bloqueado" });
    expect(result.allowed).toBe(false);
    expect(result.message).toContain("Tenant bloqueado");
  });

  it("allows online sync when license validation passes", () => {
    const result = resolveLicenseGateForOnlineSync({ valid: true });
    expect(result.allowed).toBe(true);
    expect(result.message).toBeNull();
  });

  it("does not start protected work from a cached tenant before access validation", () => {
    expect(canStartProtectedTenantWork({ tenantId: "tenant-1", accessValidated: false })).toBe(false);
    expect(canStartProtectedTenantWork({ tenantId: "tenant-1", accessValidated: true })).toBe(true);
  });
});
