import { describe, expect, it } from "vitest";

import { buildStaffProvisioningRecoveryMessage } from "./staffProvisioning";

describe("buildStaffProvisioningRecoveryMessage", () => {
  it("includes auth user recovery details when tenant membership insertion fails", () => {
    const message = buildStaffProvisioningRecoveryMessage({
      email: "staff@example.com",
      authUserId: "usr_123",
      cause: "violates row-level security policy",
    });

    expect(message).toContain("staff@example.com");
    expect(message).toContain("usr_123");
    expect(message).toContain("violates row-level security policy");
    expect(message).toContain("requiere recuperación manual");
  });

  it("still surfaces recovery-required state when the auth user id is unavailable", () => {
    const message = buildStaffProvisioningRecoveryMessage({
      email: "staff@example.com",
      authUserId: null,
      cause: "insert failed",
    });

    expect(message).toContain("staff@example.com");
    expect(message).toContain("no disponible");
    expect(message).toContain("requiere recuperación manual");
  });
});
