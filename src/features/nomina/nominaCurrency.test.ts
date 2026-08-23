import { describe, it, expect } from "vitest";
import {
  formatCurrencyInput,
  formatCentsToCurrencyDisplay,
  currencyInputToCents,
} from "./Nomina";

describe("Nomina Currency Inputs & Formatters", () => {
  describe("formatCurrencyInput", () => {
    it("handles empty or blank values", () => {
      expect(formatCurrencyInput("")).toBe("");
      expect(formatCurrencyInput("   ")).toBe("");
    });

    it("formats simple integers without forcing decimals", () => {
      expect(formatCurrencyInput("2")).toBe("2");
      expect(formatCurrencyInput("25")).toBe("25");
      expect(formatCurrencyInput("250")).toBe("250");
    });

    it("adds thousands separators automatically with commas", () => {
      expect(formatCurrencyInput("2500")).toBe("2,500");
      expect(formatCurrencyInput("25000")).toBe("25,000");
      expect(formatCurrencyInput("250000")).toBe("250,000");
      expect(formatCurrencyInput("2500000")).toBe("2,500,000");
    });

    it("preserves trailing dot when user is typing decimal numbers", () => {
      expect(formatCurrencyInput("25000.")).toBe("25,000.");
      expect(formatCurrencyInput("25000.5")).toBe("25,000.5");
      expect(formatCurrencyInput("25000.50")).toBe("25,000.50");
    });

    it("limits decimal places to maximum of 2", () => {
      expect(formatCurrencyInput("25000.509")).toBe("25,000.50");
    });

    it("handles decimal comma input gracefully", () => {
      expect(formatCurrencyInput("25000,50")).toBe("25,000.50");
    });

    it("strips non-numeric characters", () => {
      expect(formatCurrencyInput("RD$ 45,000.00")).toBe("45,000.00");
      expect(formatCurrencyInput("abc1234")).toBe("1,234");
    });
  });

  describe("formatCentsToCurrencyDisplay", () => {
    it("returns empty string for 0 or negative cents", () => {
      expect(formatCentsToCurrencyDisplay(0)).toBe("");
      expect(formatCentsToCurrencyDisplay(-500)).toBe("");
    });

    it("formats cents into 2-decimal string with commas", () => {
      expect(formatCentsToCurrencyDisplay(2500000)).toBe("25,000.00");
      expect(formatCentsToCurrencyDisplay(15050)).toBe("150.50");
      expect(formatCentsToCurrencyDisplay(100)).toBe("1.00");
    });
  });

  describe("currencyInputToCents", () => {
    it("converts formatted string to cents correctly", () => {
      expect(currencyInputToCents("")).toBe(0);
      expect(currencyInputToCents("0")).toBe(0);
      expect(currencyInputToCents("25")).toBe(2500);
      expect(currencyInputToCents("25,000")).toBe(2500000);
      expect(currencyInputToCents("25,000.50")).toBe(2500050);
      expect(currencyInputToCents("1,234,567.89")).toBe(123456789);
    });
  });
});
