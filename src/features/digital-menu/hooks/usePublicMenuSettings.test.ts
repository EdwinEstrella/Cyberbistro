import { describe, it, expect } from "vitest";
import {
  createSettingsFormState,
  extractPublicContactFromForm,
  validatePublicMenuSettingsForm,
} from "./usePublicMenuSettings";
import type { DigitalMenuSettings } from "../../menu-links/lib/publicMenuCalendar";

describe("usePublicMenuSettings helpers", () => {
  it("initializes form state correctly from an existing settings row", () => {
    const existing: DigitalMenuSettings = {
      id: "settings-1",
      tenant_id: "tenant-12345678",
      sucursal_id: null,
      enabled: true,
      public_slug: "cyber-bistro",
      title: "Cyber Bistro",
      description: "Comida gourmet",
      logo_url: "https://example.com/logo.png",
      banner_url: "https://example.com/banner.png",
      theme: { accentColor: "#10b981" },
      menu_id: "menu-99",
      updated_at: "2026-11-01T00:00:00Z",
    };

    const form = createSettingsFormState(existing, "tenant-12345678");

    expect(form).toEqual({
      enabled: true,
      slug: "cyber-bistro",
      title: "Cyber Bistro",
      description: "Comida gourmet",
      logoUrl: "https://example.com/logo.png",
      bannerUrl: "https://example.com/banner.png",
      accentColor: "#10b981",
      wifi_name: "",
      wifi_password: "",
      whatsapp: "",
      instagram: "",
      facebook: "",
      tiktok: "",
      google_review_url: "",
      maps_url: "",
      suggestion_email: "",
    });
  });

  it("initializes default form state when settings row is null", () => {
    const form = createSettingsFormState(null, "tenant-12345678");

    expect(form).toEqual({
      enabled: false,
      slug: "restaurante-tenant-1",
      title: "",
      description: "",
      logoUrl: "",
      bannerUrl: "",
      accentColor: "#f97316",
      wifi_name: "",
      wifi_password: "",
      whatsapp: "",
      instagram: "",
      facebook: "",
      tiktok: "",
      google_review_url: "",
      maps_url: "",
      suggestion_email: "",
    });
  });

  it("initializes contact fields from existing settings with public_contact", () => {
    const existing: DigitalMenuSettings = {
      id: "settings-1",
      tenant_id: "tenant-12345678",
      sucursal_id: null,
      enabled: true,
      public_slug: "cyber-bistro",
      title: "Cyber Bistro",
      description: "Comida gourmet",
      logo_url: "https://example.com/logo.png",
      banner_url: "https://example.com/banner.png",
      theme: { accentColor: "#10b981" },
      public_contact: {
        wifi_name: "BistroGuest",
        wifi_password: "clave",
        whatsapp: "18095550199",
        instagram: "cyberbistro",
        facebook: "cyberbistro",
        tiktok: "cyberbistro",
        google_review_url: "https://g.page/r/123",
        maps_url: "https://maps.google.com/?q=123",
        suggestion_email: "sugerencias@cyberbistro.com",
      },
      menu_id: "menu-99",
      updated_at: "2026-11-01T00:00:00Z",
    };

    const form = createSettingsFormState(existing, "tenant-12345678");

    expect(form.wifi_name).toBe("BistroGuest");
    expect(form.whatsapp).toBe("18095550199");
    expect(form.instagram).toBe("cyberbistro");
    expect(form.suggestion_email).toBe("sugerencias@cyberbistro.com");
  });

  it("extracts public contact fields accurately from form state", () => {
    const baseForm = createSettingsFormState(null, "t-1");
    baseForm.wifi_name = "Guest";
    baseForm.whatsapp = "8095550199";

    const extracted = extractPublicContactFromForm(baseForm);
    expect(extracted.wifi_name).toBe("Guest");
    expect(extracted.whatsapp).toBe("8095550199");
  });

  describe("validatePublicMenuSettingsForm", () => {
    it("fails when slug is empty after normalization", () => {
      const baseForm = createSettingsFormState(null, "t-1");
      baseForm.slug = "   ";
      const res = validatePublicMenuSettingsForm(baseForm);
      expect(res.valid).toBe(false);
      expect(res.slugError).toBe("El slug público es obligatorio.");
      expect(res.firstError).toBe("El slug público es obligatorio.");
    });

    it("fails and returns first error when contact fields have validation errors", () => {
      const baseForm = createSettingsFormState(null, "t-1");
      baseForm.slug = "bistro";
      baseForm.whatsapp = "123"; // Invalid: too short

      const res = validatePublicMenuSettingsForm(baseForm);
      expect(res.valid).toBe(false);
      expect(res.contactErrors.whatsapp).toBe(
        "Ingresá un número de WhatsApp válido con código de país (entre 8 y 15 dígitos)."
      );
      expect(res.firstError).toBe(
        "Ingresá un número de WhatsApp válido con código de país (entre 8 y 15 dígitos)."
      );
    });

    it("succeeds with normalized values when form is valid", () => {
      const baseForm = createSettingsFormState(null, "t-1");
      baseForm.slug = "mi-bistro-2026";
      baseForm.whatsapp = "+1 (809) 555-0199";
      baseForm.instagram = "@bistro_rd";
      baseForm.maps_url = "https://maps.google.com/?q=bistro";

      const res = validatePublicMenuSettingsForm(baseForm);
      expect(res.valid).toBe(true);
      expect(res.resolvedSlug).toBe("mi-bistro-2026");
      expect(res.normalizedContact).toEqual({
        whatsapp: "18095550199",
        instagram: "bistro_rd",
        maps_url: "https://maps.google.com/?q=bistro",
      });
      expect(res.contactErrors).toEqual({});
      expect(res.firstError).toBeUndefined();
    });
  });
});
