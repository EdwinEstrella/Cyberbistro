import { describe, it, expect } from "vitest";
import { createSettingsFormState } from "./usePublicMenuSettings";
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
    });
  });
});
