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

  it("mesero no puede abrir cierre y vuelve a camarera", () => {
    const decision = getRoleGuardDecision({
      loading: false,
      isAuthenticated: true,
      userExists: true,
      tenantId: "tenant-1",
      rol: "mesero",
      pathname: "/cierre",
    });
    expect(decision).toEqual({ type: "redirect_role", to: "/camarera" });
  });

  it("mesero solo puede abrir el módulo de camarera", () => {
    expect(
      getRoleGuardDecision({
        loading: false,
        isAuthenticated: true,
        userExists: true,
        tenantId: "tenant-1",
        rol: "mesero",
        pathname: "/camarera",
      })
    ).toEqual({ type: "allow" });

    expect(
      getRoleGuardDecision({
        loading: false,
        isAuthenticated: true,
        userExists: true,
        tenantId: "tenant-1",
        rol: "mesero",
        pathname: "/dashboard",
      })
    ).toEqual({ type: "redirect_role", to: "/camarera" });
  });

  it("ventas y cajera pueden abrir cierre", () => {
    for (const rol of ["ventas", "cajera"] as const) {
      expect(
        getRoleGuardDecision({
          loading: false,
          isAuthenticated: true,
          userExists: true,
          tenantId: "tenant-1",
          rol,
          pathname: "/cierre",
        })
      ).toEqual({ type: "allow" });
    }
  });
});
