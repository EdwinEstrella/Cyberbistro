import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicMenuHome } from "./PublicMenuHome";
import type { PublicMenuMode } from "../../lib/publicMenuMode";

describe("PublicMenuHome", () => {
  const baseSettings = {
    title: "Cyber Bistro",
    business_name: "Cyber Bistro SRL",
    description: "Platos gourmet del chef",
    logo_url: "https://example.com/logo.png",
  };

  const fullContact = {
    wifi_name: "BistroWiFi",
    wifi_password: "password123",
    whatsapp: "18095551234",
    instagram: "bistro_rd",
    facebook: "bistro_rd",
    tiktok: "bistro_rd",
    google_review_url: "https://g.page/r/bistro/review",
    maps_url: "https://maps.google.com/?q=bistro",
  };

  it("renders table mode with disabled CTA until party size is chosen", () => {
    const mode: PublicMenuMode = { kind: "table", mesa: 3 };
    const html = renderToStaticMarkup(
      <PublicMenuHome
        mode={mode}
        settings={baseSettings}
        contact={fullContact}
        partySize={null}
        onPartySizeChange={vi.fn()}
        onViewMenu={vi.fn()}
      />
    );

    // Header & identity
    expect(html).toContain("Cyber Bistro");
    expect(html).toContain("Platos gourmet del chef");
    expect(html).toContain('src="https://example.com/logo.png"');

    // Table elements
    expect(html).toContain("¿Cuántos son?");
    expect(html).toContain("🪑 Mesa 3");

    // Disabled CTA
    expect(html).toContain("Ver menú y ordenar");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Elegí la cantidad de personas para continuar");

    // All 5 utility buttons rendered
    expect(html).toContain("WiFi");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Redes sociales");
    expect(html).toContain("Calificanos en Google");
    expect(html).toContain("Cómo llegar");
  });

  it("enables CTA in table mode when party size is selected", () => {
    const mode: PublicMenuMode = { kind: "table", mesa: 3 };
    const html = renderToStaticMarkup(
      <PublicMenuHome
        mode={mode}
        settings={baseSettings}
        contact={fullContact}
        partySize={4}
        onPartySizeChange={vi.fn()}
        onViewMenu={vi.fn()}
      />
    );

    expect(html).toContain("Ver menú y ordenar");
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain("Elegí la cantidad de personas para continuar");
    expect(html).toContain("4 personas");
  });

  it("renders takeout mode without party picker, without table footer, with CTA enabled", () => {
    const mode: PublicMenuMode = { kind: "takeout", invalidMesa: false };
    const html = renderToStaticMarkup(
      <PublicMenuHome
        mode={mode}
        settings={baseSettings}
        contact={fullContact}
        partySize={null}
        onPartySizeChange={vi.fn()}
        onViewMenu={vi.fn()}
      />
    );

    expect(html).not.toContain("¿Cuántos son?");
    expect(html).not.toContain("🪑 Mesa");
    expect(html).not.toContain('aria-disabled="true"');

    // WiFi must NOT be present in takeout mode
    expect(html).not.toContain(">WiFi<");

    // Contact buttons must be present
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Redes sociales");
    expect(html).toContain("Calificanos en Google");
    expect(html).toContain("Cómo llegar");
  });

  it("displays invalid mesa alert when arriving with invalid mesa in takeout mode", () => {
    const mode: PublicMenuMode = { kind: "takeout", invalidMesa: true };
    const html = renderToStaticMarkup(
      <PublicMenuHome
        mode={mode}
        settings={baseSettings}
        contact={fullContact}
        partySize={null}
        onPartySizeChange={vi.fn()}
        onViewMenu={vi.fn()}
      />
    );

    expect(html).toContain("El QR de esta mesa no es válido; podés pedir para llevar.");
  });

  it("renders initial letter circle when logo_url is null", () => {
    const mode: PublicMenuMode = { kind: "takeout", invalidMesa: false };
    const html = renderToStaticMarkup(
      <PublicMenuHome
        mode={mode}
        settings={{ ...baseSettings, logo_url: null, title: "La Trattoria" }}
        contact={{}}
        partySize={null}
        onPartySizeChange={vi.fn()}
        onViewMenu={vi.fn()}
      />
    );

    expect(html).toContain(">L</div>");
    expect(html).not.toContain("<img");
  });

  it("verifies mobile layout safety: no horizontal overflow and primary button >= 56px tall", () => {
    const mode: PublicMenuMode = { kind: "table", mesa: 1 };
    const html = renderToStaticMarkup(
      <PublicMenuHome
        mode={mode}
        settings={baseSettings}
        contact={fullContact}
        partySize={2}
        onPartySizeChange={vi.fn()}
        onViewMenu={vi.fn()}
      />
    );

    // Overflow protection on root container
    expect(html).toContain("overflow-x-hidden");
    // Main content centered within max-w-sm
    expect(html).toContain("max-w-sm");
    // Primary CTA button has min-h-[56px]
    expect(html).toContain("min-h-[56px]");
  });
});
