import { describe, expect, it } from "vitest";
import { getMenuLinkLimit } from "./menuLinkLimits";

describe("getMenuLinkLimit", () => {
  it("returns 2 for plan empresarial", () => {
    expect(getMenuLinkLimit("empresarial")).toBe(2);
    expect(getMenuLinkLimit("EMPRESARIAL")).toBe(2);
    expect(getMenuLinkLimit("  empresarial  ")).toBe(2);
  });

  it("returns 6 for plan corporativo", () => {
    expect(getMenuLinkLimit("corporativo")).toBe(6);
    expect(getMenuLinkLimit("CORPORATIVO")).toBe(6);
    expect(getMenuLinkLimit("  corporativo  ")).toBe(6);
  });

  it("returns 0 for basico, profesional, unknown or empty plans", () => {
    expect(getMenuLinkLimit("basico")).toBe(0);
    expect(getMenuLinkLimit("profesional")).toBe(0);
    expect(getMenuLinkLimit("other")).toBe(0);
    expect(getMenuLinkLimit("")).toBe(0);
    expect(getMenuLinkLimit(null)).toBe(0);
    expect(getMenuLinkLimit(undefined)).toBe(0);
  });
});
