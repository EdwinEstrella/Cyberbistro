import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchIsSuperAdmin, SUPER_ADMIN_ROLE, SUPER_ADMIN_TENANT_ID, SUPER_ADMIN_ROUTE } from "./superAdmin";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc };
});

vi.mock("./supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

describe("superAdmin", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("exports expected constants", () => {
    expect(SUPER_ADMIN_ROLE).toBe("super_admin");
    expect(SUPER_ADMIN_TENANT_ID).toBe("__super_admin__");
    expect(SUPER_ADMIN_ROUTE).toBe("/super-admin");
  });

  it("returns true when cyberbistro_am_i_super_admin returns true", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await fetchIsSuperAdmin();
    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("cyberbistro_am_i_super_admin");
  });

  it("returns false when cyberbistro_am_i_super_admin returns false", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });

    const result = await fetchIsSuperAdmin();
    expect(result).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("cyberbistro_am_i_super_admin");
  });

  it("fails closed (returns false) when rpc returns an error", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Permission denied" } });

    const result = await fetchIsSuperAdmin();
    expect(result).toBe(false);
  });

  it("fails closed (returns false) when rpc throws/network fails", async () => {
    mocks.rpc.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await fetchIsSuperAdmin();
    expect(result).toBe(false);
  });
});
