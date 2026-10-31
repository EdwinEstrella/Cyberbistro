import { describe, expect, it } from "vitest";
import {
  hasCreditLimitChanged,
  isNetworkError,
  parseCreditLimit,
} from "./creditLimitRepo";

describe("creditLimitRepo pure helpers", () => {
  describe("parseCreditLimit", () => {
    it("returns null for empty, whitespace, null, or undefined values", () => {
      expect(parseCreditLimit(null)).toBeNull();
      expect(parseCreditLimit(undefined)).toBeNull();
      expect(parseCreditLimit("")).toBeNull();
      expect(parseCreditLimit("   ")).toBeNull();
    });

    it("parses valid zero and positive numbers and strings", () => {
      expect(parseCreditLimit(0)).toBe(0);
      expect(parseCreditLimit("0")).toBe(0);
      expect(parseCreditLimit("0.00")).toBe(0);
      expect(parseCreditLimit(1500)).toBe(1500);
      expect(parseCreditLimit("5000.50")).toBe(5000.5);
      expect(parseCreditLimit("100.999")).toBe(101);
      expect(parseCreditLimit("100.554")).toBe(100.55);
    });

    it("throws descriptive error for negative numbers or invalid strings", () => {
      expect(() => parseCreditLimit(-10)).toThrow("límite de crédito");
      expect(() => parseCreditLimit("-0.01")).toThrow("límite de crédito");
      expect(() => parseCreditLimit("abc")).toThrow("límite de crédito");
      expect(() => parseCreditLimit(NaN)).toThrow("límite de crédito");
      expect(() => parseCreditLimit(Infinity)).toThrow("límite de crédito");
    });
  });

  describe("hasCreditLimitChanged", () => {
    it("returns false when both values are null", () => {
      expect(hasCreditLimitChanged(null, null)).toBe(false);
    });

    it("returns false when both values represent the same numeric limit", () => {
      expect(hasCreditLimitChanged(500, 500)).toBe(false);
      expect(hasCreditLimitChanged(500.5, 500.5)).toBe(false);
      expect(hasCreditLimitChanged(0, 0)).toBe(false);
    });

    it("returns true when value changes from null to a number or vice versa", () => {
      expect(hasCreditLimitChanged(null, 500)).toBe(true);
      expect(hasCreditLimitChanged(500, null)).toBe(true);
      expect(hasCreditLimitChanged(null, 0)).toBe(true);
    });

    it("returns true when numerical values differ", () => {
      expect(hasCreditLimitChanged(500, 600)).toBe(true);
      expect(hasCreditLimitChanged(100.5, 100.6)).toBe(true);
    });

    it("returns false when original value is undefined (unknown/failed fetch)", () => {
      expect(hasCreditLimitChanged(undefined, 500)).toBe(false);
      expect(hasCreditLimitChanged(undefined, null)).toBe(false);
      expect(hasCreditLimitChanged(undefined, undefined)).toBe(false);
    });
  });

  describe("isNetworkError", () => {
    it("detects fetch failures and network exceptions", () => {
      expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
      expect(isNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
      expect(isNetworkError(new Error("connection refused"))).toBe(true);
      expect(isNetworkError(new Error("Se requiere conexión a internet"))).toBe(true);
      expect(isNetworkError(new Error("Some other database error"))).toBe(false);
    });
  });
});
