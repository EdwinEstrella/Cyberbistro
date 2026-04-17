import { describe, expect, it } from "vitest";
import { getRoleGuardDecision } from "./roleGuardDecision";

describe("getRoleGuardDecision", () => {
  it("bloquea mientras carga", () => {
    expect(
      getRoleGuardDecision({
        loading: true,
        isAuthenticated: false,
        userExists: false,
        tenantId: null,
        rol: null,
        pathname: "/dashboard",
      })
    ).toEqual({ type: "loading" });
  });

  it("redirige a login cuando no hay sesión", () => {
    expect(
      getRoleGuardDecision({
        loading: false,
        isAuthenticated: false,
        userExists: false,
        tenantId: null,
        rol: null,
        pathname: "/dashboard",
      })
    ).toEqual({ type: "redirect_login" });
  });

  it("muestra bloqueo de vínculo tenant cuando hay usuario sin tenant", () => {
    expect(
      getRoleGuardDecision({
        loading: false,
        isAuthenticated: true,
        userExists: true,
        tenantId: null,
        rol: "cajera",
        pathname: "/dashboard",
      })
    ).toEqual({ type: "tenant_link_required" });
  });

  it("redirige por rol cuando la ruta no está permitida", () => {
    const decision = getRoleGuardDecision({
      loading: false,
      isAuthenticated: true,
      userExists: true,
      tenantId: "tenant-1",
      rol: "cajera",
      pathname: "/soporte",
    });
    expect(decision.type).toBe("redirect_role");
  });
});
