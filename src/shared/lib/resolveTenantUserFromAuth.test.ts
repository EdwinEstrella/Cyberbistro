import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveTenantUserForSession } from "./resolveTenantUserFromAuth";

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const chain: any = {};
  const eq = vi.fn(() => chain);
  const ilike = vi.fn(() => chain);
  Object.assign(chain, { eq, ilike, maybeSingle });
  const select = vi.fn(() => chain);
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();
  return { maybeSingle, eq, ilike, from, rpc };
});

vi.mock("./insforge", () => ({
  insforgeClient: {
    database: {
      from: mocks.from,
      rpc: mocks.rpc,
    },
  },
}));

describe("resolveTenantUserForSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("resuelve por auth_user_id primero", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { tenant_id: "t1", email: "u@x.com", rol: "admin", nombre: "U" },
      error: null,
    });
    const row = await resolveTenantUserForSession({ id: "auth-1", email: "u@x.com" } as any);
    expect(row?.tenant_id).toBe("t1");
    expect(mocks.from).toHaveBeenCalledWith("tenant_users");
  });

  it("cae a búsqueda por email si auth_user_id no encuentra", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { tenant_id: "t2", email: "u2@x.com", rol: "mesero", nombre: "U2" },
        error: null,
      });
    const row = await resolveTenantUserForSession({ id: "auth-2", email: "u2@x.com" } as any);
    expect(row?.tenant_id).toBe("t2");
    expect(mocks.ilike).toHaveBeenCalled();
  });

  it("retorna null si no hay auth ni email", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const row = await resolveTenantUserForSession({ id: "auth-3", email: null } as any);
    expect(row).toBeNull();
  });

  it("filtra usuarios inactivos en las consultas directas", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await resolveTenantUserForSession({ id: "auth-inactive", email: null } as any);

    expect(mocks.eq).toHaveBeenCalledWith("auth_user_id", "auth-inactive");
    expect(mocks.eq).toHaveBeenCalledWith("activo", true);
  });

  it("cae a rpc si RLS no permite resolver por consultas directas", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ tenant_id: "t3", email: "u3@x.com", rol: "cajera", nombre: "U3" }],
      error: null,
    });

    const row = await resolveTenantUserForSession({ id: "auth-4", email: "u3@x.com" } as any);
    expect(row?.tenant_id).toBe("t3");
    expect(mocks.rpc).toHaveBeenCalledWith("cloudix_resolve_tenant_user");
  });
});
