import { describe, expect, it } from "vitest";
import {
  buildSocialUrl,
  buildWhatsAppUrl,
  buildWhatsAppVCard,
  getUtilityActions,
  sanitizeHttpsUrl,
} from "./contactLinks";

describe("sanitizeHttpsUrl", () => {
  it("accepts valid https URLs", () => {
    expect(sanitizeHttpsUrl("https://example.com")).toBe("https://example.com/");
    expect(sanitizeHttpsUrl("https://maps.google.com/?q=bistro")).toBe(
      "https://maps.google.com/?q=bistro"
    );
  });

  it("rejects non-https protocols and malformed URLs", () => {
    expect(sanitizeHttpsUrl("http://insecure.com")).toBeNull();
    expect(sanitizeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpsUrl("data:text/plain,hello")).toBeNull();
    expect(sanitizeHttpsUrl("ftp://files.com")).toBeNull();
    expect(sanitizeHttpsUrl("not a url")).toBeNull();
    expect(sanitizeHttpsUrl("")).toBeNull();
    expect(sanitizeHttpsUrl(null)).toBeNull();
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds wa.me URL for valid phone numbers", () => {
    expect(buildWhatsAppUrl("18095551234")).toBe("https://wa.me/18095551234");
    expect(buildWhatsAppUrl("+1 (809) 555-1234")).toBe("https://wa.me/18095551234");
  });

  it("returns null for invalid or out-of-range phone numbers", () => {
    expect(buildWhatsAppUrl("1234567")).toBeNull(); // 7 digits
    expect(buildWhatsAppUrl("1234567890123456")).toBeNull(); // 16 digits
    expect(buildWhatsAppUrl("")).toBeNull();
    expect(buildWhatsAppUrl("no-digits")).toBeNull();
  });
});

describe("buildWhatsAppVCard", () => {
  it("generates valid vCard 3.0 string with escaped characters", () => {
    const vcard = buildWhatsAppVCard("Bistro, & Bar; Gourmet\nPlaza", "+18095551234");
    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("VERSION:3.0");
    expect(vcard).toContain("FN:Bistro\\, & Bar\\; Gourmet\\nPlaza");
    expect(vcard).toContain("TEL;TYPE=CELL:+18095551234");
    expect(vcard).toContain("END:VCARD");
  });

  it("defaults empty name to Restaurante", () => {
    const vcard = buildWhatsAppVCard("", "8095551234");
    expect(vcard).toContain("FN:Restaurante");
  });
});

describe("buildSocialUrl", () => {
  it("builds Instagram URL from handle or full https URL", () => {
    expect(buildSocialUrl("instagram", "bistro_rd")).toBe("https://instagram.com/bistro_rd");
    expect(buildSocialUrl("instagram", "@bistro.rd")).toBe("https://instagram.com/bistro.rd");
    expect(buildSocialUrl("instagram", "https://instagram.com/bistro_rd")).toBe(
      "https://instagram.com/bistro_rd"
    );
    expect(buildSocialUrl("instagram", "http://instagram.com/bistro")).toBeNull();
    expect(buildSocialUrl("instagram", "https://evil.com/bistro")).toBeNull();
  });

  it("builds Facebook URL from handle or full https URL", () => {
    expect(buildSocialUrl("facebook", "bistro.rd")).toBe("https://facebook.com/bistro.rd");
    expect(buildSocialUrl("facebook", "@bistro.rd")).toBe("https://facebook.com/bistro.rd");
    expect(buildSocialUrl("facebook", "https://facebook.com/bistro")).toBe(
      "https://facebook.com/bistro"
    );
    expect(buildSocialUrl("facebook", "https://fb.com/bistro")).toBe("https://fb.com/bistro");
    expect(buildSocialUrl("facebook", "http://facebook.com/bistro")).toBeNull();
  });

  it("builds TikTok URL with @ prefix from handle or full https URL", () => {
    expect(buildSocialUrl("tiktok", "bistro_rd")).toBe("https://tiktok.com/@bistro_rd");
    expect(buildSocialUrl("tiktok", "@bistro_rd")).toBe("https://tiktok.com/@bistro_rd");
    expect(buildSocialUrl("tiktok", "https://tiktok.com/@bistro_rd")).toBe(
      "https://tiktok.com/@bistro_rd"
    );
    expect(buildSocialUrl("tiktok", "http://tiktok.com/@bistro_rd")).toBeNull();
  });
});

describe("getUtilityActions", () => {
  const fullContact = {
    wifi_name: "BistroWiFi",
    wifi_password: "secretpassword",
    whatsapp: "18095551234",
    instagram: "bistro_rd",
    google_review_url: "https://g.page/r/bistro/review",
    maps_url: "https://maps.google.com/?q=bistro",
  };

  it("returns all 5 actions in table mode when all data is present", () => {
    const actions = getUtilityActions(fullContact, "table");
    expect(actions.map((a) => a.id)).toEqual([
      "wifi",
      "whatsapp",
      "social",
      "google_review",
      "maps",
    ]);
  });

  it("excludes wifi in takeout mode even if wifi_name is configured", () => {
    const actions = getUtilityActions(fullContact, "takeout");
    expect(actions.map((a) => a.id)).toEqual([
      "whatsapp",
      "social",
      "google_review",
      "maps",
    ]);
  });

  it("omits buttons when data is missing or empty", () => {
    const actions = getUtilityActions(
      {
        whatsapp: "18095551234",
      },
      "table"
    );
    expect(actions.map((a) => a.id)).toEqual(["whatsapp"]);
  });

  it("omits social button if all social handles/links are invalid or empty", () => {
    const actions = getUtilityActions(
      {
        instagram: "http://insecure.com",
        facebook: "",
      },
      "table"
    );
    expect(actions.find((a) => a.id === "social")).toBeUndefined();
  });

  it("drops insecure or non-https review and maps URLs", () => {
    const actions = getUtilityActions(
      {
        google_review_url: "http://insecure.com",
        maps_url: "javascript:alert(1)",
      },
      "takeout"
    );
    expect(actions).toEqual([]);
  });
});
