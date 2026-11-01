import { describe, expect, it } from "vitest";
import { defaultSucursalLimitForPlan } from "./SucursalContext";

describe("defaultSucursalLimitForPlan", () => {
  it("asigna 1 sucursal para plan basico", () => {
    expect(defaultSucursalLimitForPlan("basico")).toBe(1);
    expect(defaultSucursalLimitForPlan(null)).toBe(1);
    expect(defaultSucursalLimitForPlan(undefined)).toBe(1);
    expect(defaultSucursalLimitForPlan("unknown")).toBe(1);
  });

  it("asigna 2 sucursales para plan profesional", () => {
    expect(defaultSucursalLimitForPlan("profesional")).toBe(2);
  });

  it("asigna sucursales ilimitadas (null) para plan empresarial", () => {
    expect(defaultSucursalLimitForPlan("empresarial")).toBeNull();
  });

  it("asigna sucursales ilimitadas (null) para plan corporativo", () => {
    expect(defaultSucursalLimitForPlan("corporativo")).toBeNull();
    expect(defaultSucursalLimitForPlan(" CORPORATIVO ")).toBeNull();
  });
});
