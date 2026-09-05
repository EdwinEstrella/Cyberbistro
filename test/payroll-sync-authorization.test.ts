import { describe, expect, it } from "vitest";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";

function authorizationClient(rows: unknown[]) {
  return new PayrollSyncClient({
    database: {
      rpc: async () => ({ data: rows, error: null }),
    },
  } as any);
}

describe("payroll authorization context", () => {
  it("accepts the authoritative tenant-wide branch list returned for an owner", async () => {
    await expect(authorizationClient([{
      tenant_id: "tenant-1",
      rol: "admin",
      allowed_branch_ids: ["branch-1", "branch-2"],
    }]).resolveAuthorizationContext()).resolves.toEqual({
      tenantId: "tenant-1",
      allowedBranchIds: ["branch-1", "branch-2"],
    });
  });

  it("accepts only explicitly assigned staff branches and rejects an unassigned staff membership", async () => {
    await expect(authorizationClient([{
      tenant_id: "tenant-1",
      rol: "contabilidad",
      allowed_branch_ids: ["branch-2"],
    }]).resolveAuthorizationContext()).resolves.toEqual({
      tenantId: "tenant-1",
      allowedBranchIds: ["branch-2"],
    });

    await expect(authorizationClient([{
      tenant_id: "tenant-1",
      rol: "contabilidad",
      allowed_branch_ids: [],
    }]).resolveAuthorizationContext()).rejects.toThrow("Payroll authorization has no assigned branches");
  });
});
