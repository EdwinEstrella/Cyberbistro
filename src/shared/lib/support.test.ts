import { describe, expect, it } from "vitest";
import {
  SUPPORT_WHATSAPP_PHONE,
  SUPPORT_WHATSAPP_BLOCKED_URL,
  formatSupportPhone,
} from "./support";

describe("support library", () => {
  it("exports phone and URL constants", () => {
    expect(SUPPORT_WHATSAPP_PHONE).toBe("18095968986");
    expect(SUPPORT_WHATSAPP_BLOCKED_URL).toContain("wa.me/18095968986");
  });

  describe("formatSupportPhone", () => {
    it("formats 11-digit phone number with leading 1 into standard NANP display format", () => {
      expect(formatSupportPhone("18095968986")).toBe("+1 (809) 596-8986");
    });

    it("formats 10-digit phone number into standard NANP display format", () => {
      expect(formatSupportPhone("8095968986")).toBe("+1 (809) 596-8986");
      expect(formatSupportPhone("8291234567")).toBe("+1 (829) 123-4567");
    });

    it("strips existing non-digit formatting characters and reformats cleanly", () => {
      expect(formatSupportPhone("+1-809-596-8986")).toBe("+1 (809) 596-8986");
      expect(formatSupportPhone("(809) 596-8986")).toBe("+1 (809) 596-8986");
    });

    it("falls back to raw string for unexpected digit lengths", () => {
      expect(formatSupportPhone("123")).toBe("123");
      expect(formatSupportPhone("")).toBe("");
    });
  });
});
