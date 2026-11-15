import { describe, it, expect } from "vitest";
import { normalizePublicContact } from "./publicContact";

describe("normalizePublicContact", () => {
  it("handles null, undefined, or empty object", () => {
    expect(normalizePublicContact(null)).toEqual({ value: {}, errors: {} });
    expect(normalizePublicContact(undefined)).toEqual({ value: {}, errors: {} });
    expect(normalizePublicContact({})).toEqual({ value: {}, errors: {} });
  });

  it("trims strings and drops empty or whitespace-only values", () => {
    const result = normalizePublicContact({
      wifi_name: "  Mi WiFi  ",
      wifi_password: "   ",
      whatsapp: "",
      instagram: "   ",
      facebook: null,
      tiktok: undefined,
    });

    expect(result.errors).toEqual({});
    expect(result.value).toEqual({
      wifi_name: "Mi WiFi",
    });
  });

  describe("wifi_name & wifi_password", () => {
    it("accepts valid wifi credentials within length limits", () => {
      const result = normalizePublicContact({
        wifi_name: "CyberBistro-5G",
        wifi_password: "SuperSecretPassword123!",
      });

      expect(result.errors).toEqual({});
      expect(result.value).toEqual({
        wifi_name: "CyberBistro-5G",
        wifi_password: "SuperSecretPassword123!",
      });
    });

    it("rejects wifi_name longer than 64 characters", () => {
      const longName = "A".repeat(65);
      const result = normalizePublicContact({ wifi_name: longName });
      expect(result.errors.wifi_name).toBe("El nombre del WiFi no puede tener más de 64 caracteres.");
      expect(result.value.wifi_name).toBeUndefined();
    });

    it("rejects wifi_password longer than 128 characters", () => {
      const longPass = "P".repeat(129);
      const result = normalizePublicContact({ wifi_password: longPass });
      expect(result.errors.wifi_password).toBe("La clave del WiFi no puede tener más de 128 caracteres.");
      expect(result.value.wifi_password).toBeUndefined();
    });
  });

  describe("whatsapp", () => {
    it("strips spaces, dashes, parentheses, dots and leading +, storing only digits", () => {
      const cases = [
        { input: "+1 (809) 555-0199", expected: "18095550199" },
        { input: "+1-809-555-0199", expected: "18095550199" },
        { input: "1.809.555.0199", expected: "18095550199" },
        { input: "18095550199", expected: "18095550199" },
        { input: "80955501", expected: "80955501" }, // 8 digits (min)
        { input: "123456789012345", expected: "123456789012345" }, // 15 digits (max)
      ];

      for (const { input, expected } of cases) {
        const result = normalizePublicContact({ whatsapp: input });
        expect(result.errors.whatsapp).toBeUndefined();
        expect(result.value.whatsapp).toBe(expected);
      }
    });

    it("rejects phone numbers with fewer than 8 digits or more than 15 digits", () => {
      const shortRes = normalizePublicContact({ whatsapp: "1234567" });
      expect(shortRes.errors.whatsapp).toBe(
        "Ingresá un número de WhatsApp válido con código de país (entre 8 y 15 dígitos)."
      );

      const longRes = normalizePublicContact({ whatsapp: "1234567890123456" });
      expect(longRes.errors.whatsapp).toBe(
        "Ingresá un número de WhatsApp válido con código de país (entre 8 y 15 dígitos)."
      );
    });

    it("rejects letters and special characters in whatsapp", () => {
      const result = normalizePublicContact({ whatsapp: "1809555abcd" });
      expect(result.errors.whatsapp).toBe(
        "Ingresá un número de WhatsApp válido con código de país (entre 8 y 15 dígitos)."
      );
    });
  });

  describe("social networks (instagram, facebook, tiktok)", () => {
    it("stores instagram handle stripped of @ or valid https URL", () => {
      expect(normalizePublicContact({ instagram: "@cyberbistro" }).value.instagram).toBe("cyberbistro");
      expect(normalizePublicContact({ instagram: "cyberbistro_rd" }).value.instagram).toBe("cyberbistro_rd");
      expect(normalizePublicContact({ instagram: "https://www.instagram.com/cyberbistro" }).value.instagram).toBe(
        "https://www.instagram.com/cyberbistro"
      );
      expect(normalizePublicContact({ instagram: "https://instagr.am/cyberbistro" }).value.instagram).toBe(
        "https://instagr.am/cyberbistro"
      );
    });

    it("rejects invalid instagram handles and non-https/wrong-domain URLs", () => {
      const badHandles = ["cyber bistro", "bad/handle", "cyber@bistro", "http://instagram.com/foo"];
      for (const bad of badHandles) {
        const res = normalizePublicContact({ instagram: bad });
        expect(res.errors.instagram).toBe("Ingresá un usuario o enlace válido de Instagram.");
      }

      const wrongDomain = normalizePublicContact({ instagram: "https://notinstagram.com/user" });
      expect(wrongDomain.errors.instagram).toBe("Ingresá un usuario o enlace válido de Instagram.");
    });

    it("stores facebook handle stripped of @ or valid https URL", () => {
      expect(normalizePublicContact({ facebook: "@cyberbistro" }).value.facebook).toBe("cyberbistro");
      expect(normalizePublicContact({ facebook: "cyberbistro.rd" }).value.facebook).toBe("cyberbistro.rd");
      expect(normalizePublicContact({ facebook: "https://facebook.com/cyberbistro" }).value.facebook).toBe(
        "https://facebook.com/cyberbistro"
      );
      expect(normalizePublicContact({ facebook: "https://www.fb.com/cyberbistro" }).value.facebook).toBe(
        "https://www.fb.com/cyberbistro"
      );
    });

    it("rejects invalid facebook inputs", () => {
      const badInputs = ["fb user with space", "http://facebook.com/user", "https://other.com/fb"];
      for (const bad of badInputs) {
        const res = normalizePublicContact({ facebook: bad });
        expect(res.errors.facebook).toBe("Ingresá un usuario o enlace válido de Facebook.");
      }
    });

    it("stores tiktok handle stripped of @ or valid https URL", () => {
      expect(normalizePublicContact({ tiktok: "@cyberbistro" }).value.tiktok).toBe("cyberbistro");
      expect(normalizePublicContact({ tiktok: "cyber_bistro.official" }).value.tiktok).toBe("cyber_bistro.official");
      expect(normalizePublicContact({ tiktok: "https://www.tiktok.com/@cyberbistro" }).value.tiktok).toBe(
        "https://www.tiktok.com/@cyberbistro"
      );
    });

    it("rejects invalid tiktok inputs", () => {
      const badInputs = ["tiktok with space", "http://tiktok.com/@user", "https://fake-tiktok.com/@user"];
      for (const bad of badInputs) {
        const res = normalizePublicContact({ tiktok: bad });
        expect(res.errors.tiktok).toBe("Ingresá un usuario o enlace válido de TikTok.");
      }
    });
  });

  describe("google_review_url & maps_url", () => {
    it("accepts valid https URLs for google review and maps", () => {
      const result = normalizePublicContact({
        google_review_url: "https://g.page/r/CbistroReview/review",
        maps_url: "https://maps.google.com/?q=CyberBistro",
      });

      expect(result.errors).toEqual({});
      expect(result.value.google_review_url).toBe("https://g.page/r/CbistroReview/review");
      expect(result.value.maps_url).toBe("https://maps.google.com/?q=CyberBistro");
    });

    it("rejects non-https, javascript: and malformed URLs", () => {
      const xssCases = [
        "javascript:alert(1)",
        "http://maps.google.com",
        "data:text/html,<script>alert(1)</script>",
        "just a text string",
      ];

      for (const badUrl of xssCases) {
        const reviewRes = normalizePublicContact({ google_review_url: badUrl });
        expect(reviewRes.errors.google_review_url).toBe(
          "Ingresá un enlace válido que comience con https:// para la reseña de Google."
        );

        const mapsRes = normalizePublicContact({ maps_url: badUrl });
        expect(mapsRes.errors.maps_url).toBe(
          "Ingresá un enlace válido que comience con https:// para Google Maps."
        );
      }
    });
  });

  describe("suggestion_email", () => {
    it("accepts valid email addresses within length limits", () => {
      const validEmails = [
        "owner@cyberbistro.com",
        "feedback+bistro@sub.example.org",
        "gerente123@restaurant.do",
      ];

      for (const email of validEmails) {
        const res = normalizePublicContact({ suggestion_email: email });
        expect(res.errors.suggestion_email).toBeUndefined();
        expect(res.value.suggestion_email).toBe(email);
      }
    });

    it("rejects invalid email formats and oversized addresses", () => {
      const invalidEmails = [
        "notanemail",
        "owner@",
        "@cyberbistro.com",
        "owner@.com",
        "javascript:alert(1)",
        "user@domain",
      ];

      for (const bad of invalidEmails) {
        const res = normalizePublicContact({ suggestion_email: bad });
        expect(res.errors.suggestion_email).toBe("Ingresá un correo electrónico válido para recibir sugerencias.");
      }

      const longLocalPart = "a".repeat(245);
      const longEmail = `${longLocalPart}@example.com`; // > 254
      const longRes = normalizePublicContact({ suggestion_email: longEmail });
      expect(longRes.errors.suggestion_email).toBe("Ingresá un correo electrónico válido para recibir sugerencias.");
    });
  });

  describe("complete payload validation", () => {
    it("normalizes and accepts a full valid payload", () => {
      const fullInput = {
        wifi_name: "  CyberBistro WiFi  ",
        wifi_password: "  bistro2026!  ",
        whatsapp: " +1 (809) 555-0199 ",
        instagram: " @cyberbistro ",
        facebook: " https://facebook.com/cyberbistro ",
        tiktok: " @bistrotok ",
        google_review_url: " https://g.page/r/test/review ",
        maps_url: " https://maps.google.com/?cid=123 ",
        suggestion_email: " feedback@cyberbistro.com ",
      };

      const { value, errors } = normalizePublicContact(fullInput);

      expect(errors).toEqual({});
      expect(value).toEqual({
        wifi_name: "CyberBistro WiFi",
        wifi_password: "bistro2026!",
        whatsapp: "18095550199",
        instagram: "cyberbistro",
        facebook: "https://facebook.com/cyberbistro",
        tiktok: "bistrotok",
        google_review_url: "https://g.page/r/test/review",
        maps_url: "https://maps.google.com/?cid=123",
        suggestion_email: "feedback@cyberbistro.com",
      });
    });
  });
});
