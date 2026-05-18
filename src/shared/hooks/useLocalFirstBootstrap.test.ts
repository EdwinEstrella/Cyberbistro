import { describe, expect, it } from "vitest";
import { resolveLicenseGateForOnlineSync } from "./useLocalFirstBootstrap";

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
});
