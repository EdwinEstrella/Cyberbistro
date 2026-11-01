import { describe, expect, it } from "vitest";
import { formatRnc, getTenantInitials, formatDateTime } from "../formatters";

describe("formatters", () => {
  describe("formatRnc", () => {
    it("returns 'Sin RNC' for null, undefined, or empty values", () => {
      expect(formatRnc(null)).toBe("Sin RNC");
      expect(formatRnc(undefined)).toBe("Sin RNC");
      expect(formatRnc("")).toBe("Sin RNC");
      expect(formatRnc("   ")).toBe("Sin RNC");
    });

    it("formats 9-digit raw Dominican RNC into standard 3-5-1 format", () => {
      expect(formatRnc("131234567")).toBe("131-23456-7");
      expect(formatRnc("101001234")).toBe("101-00123-4");
    });

    it("formats 11-digit raw Dominican cédula into standard 3-7-1 format", () => {
      expect(formatRnc("00112345678")).toBe("001-1234567-8");
    });

    it("preserves already formatted valid RNCs", () => {
      expect(formatRnc("1-31-23456-7")).toBe("1-31-23456-7");
      expect(formatRnc("101-00123-4")).toBe("101-00123-4");
      expect(formatRnc("001-1234567-8")).toBe("001-1234567-8");
    });
  });

  describe("getTenantInitials", () => {
    it("returns initials from first two words", () => {
      expect(getTenantInitials("Salpimentao Restaurant")).toBe("SR");
      expect(getTenantInitials("El Rinconcito Gourmet")).toBe("ER");
    });

    it("returns first two letters for single word", () => {
      expect(getTenantInitials("Bistro")).toBe("BI");
      expect(getTenantInitials("A")).toBe("A");
    });

    it("falls back to 'RE' when empty or null", () => {
      expect(getTenantInitials(null)).toBe("RE");
      expect(getTenantInitials("")).toBe("RE");
      expect(getTenantInitials("   ")).toBe("RE");
    });
  });

  describe("formatDateTime", () => {
    it("returns '-' for null or invalid dates", () => {
      expect(formatDateTime(null)).toBe("-");
      expect(formatDateTime("invalid-date")).toBe("-");
    });

    it("formats valid ISO timestamp", () => {
      const formatted = formatDateTime("2026-10-31T14:30:00.000Z");
      expect(formatted).not.toBe("-");
      expect(formatted).toContain("2026");
    });
  });
});
