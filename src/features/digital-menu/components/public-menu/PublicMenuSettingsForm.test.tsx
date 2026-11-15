import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PublicMenuSettingsForm,
  type PublicMenuSettingsFormProps,
} from "./PublicMenuSettingsForm";

describe("PublicMenuSettingsForm", () => {
  const baseProps: PublicMenuSettingsFormProps = {
    enabled: true,
    onEnabledChange: vi.fn(),
    slug: "cyber-bistro",
    onSlugChange: vi.fn(),
    title: "Cyber Bistro",
    onTitleChange: vi.fn(),
    description: "Comida gourmet",
    onDescriptionChange: vi.fn(),
    logoUrl: "https://example.com/logo.png",
    onLogoUrlChange: vi.fn(),
    bannerUrl: "https://example.com/banner.jpg",
    onBannerUrlChange: vi.fn(),
    wifiName: "BistroWifi",
    onWifiNameChange: vi.fn(),
    wifiPassword: "SecretPassword123",
    onWifiPasswordChange: vi.fn(),
    whatsapp: "+1 809 555 0199",
    onWhatsappChange: vi.fn(),
    instagram: "cyberbistro",
    onInstagramChange: vi.fn(),
    facebook: "cyberbistro",
    onFacebookChange: vi.fn(),
    tiktok: "cyberbistro",
    onTiktokChange: vi.fn(),
    googleReviewUrl: "https://g.page/r/test/review",
    onGoogleReviewUrlChange: vi.fn(),
    mapsUrl: "https://maps.google.com/?q=test",
    onMapsUrlChange: vi.fn(),
    suggestionEmail: "sugerencias@cyberbistro.com",
    onSuggestionEmailChange: vi.fn(),
    contactErrors: {},
    savingSettings: false,
    onSubmit: vi.fn(),
  };

  it("renders all general fields and 9 contact fields with exact labels and placeholders", () => {
    const html = renderToStaticMarkup(<PublicMenuSettingsForm {...baseProps} />);

    // General fields
    expect(html).toContain("Activar Menú Digital");
    expect(html).toContain("Enlace del Restaurante (Slug)");
    expect(html).toContain("Título Público");
    expect(html).toContain("Descripción del Negocio");
    expect(html).toContain("URL del Logo (opcional)");
    expect(html).toContain("URL del Banner (opcional)");

    // Section title
    expect(html).toContain("Información para tus clientes");

    // All 9 contact fields
    expect(html).toContain("Nombre del WiFi");
    expect(html).toContain("Ej. CyberBistro_Clientes");

    expect(html).toContain("Clave del WiFi");
    expect(html).toContain("Clave para que los comensales se conecten");

    expect(html).toContain("WhatsApp (con código de país)");
    expect(html).toContain("Ej. +1 809 555 0199");

    expect(html).toContain("Instagram");
    expect(html).toContain("Facebook");
    expect(html).toContain("TikTok");
    expect(html).toContain("@tu_restaurante o enlace https://");

    expect(html).toContain("Enlace para calificarnos en Google");
    expect(html).toContain("https://g.page/r/.../review");

    expect(html).toContain("Enlace de Google Maps (cómo llegar)");
    expect(html).toContain("https://maps.google.com/?q=...");

    expect(html).toContain("Correo para recibir sugerencias");
    expect(html).toContain("sugerencias@mirestaurante.com");
    expect(html).toContain(
      "Si lo dejás vacío, las sugerencias se guardan en el sistema pero no se envían por correo."
    );
  });

  it("includes autoComplete='off' on wifi password and suggestion email inputs", () => {
    const html = renderToStaticMarkup(<PublicMenuSettingsForm {...baseProps} />);

    // Look for autocomplete="off" on the rendered markup
    const autocompleteMatches = html.match(/autocomplete="off"/gi);
    expect(autocompleteMatches?.length).toBeGreaterThanOrEqual(2);
  });

  it("renders inline error messages for contact fields", () => {
    const propsWithErrors: PublicMenuSettingsFormProps = {
      ...baseProps,
      contactErrors: {
        wifi_name: "El nombre del WiFi excede los 64 caracteres.",
        wifi_password: "La clave del WiFi excede los 128 caracteres.",
        whatsapp: "Número de WhatsApp inválido.",
        instagram: "Usuario o enlace de Instagram inválido.",
        facebook: "Usuario o enlace de Facebook inválido.",
        tiktok: "Usuario o enlace de TikTok inválido.",
        google_review_url: "El enlace de Google Reviews debe comenzar con https://",
        maps_url: "El enlace de Google Maps debe comenzar con https://",
        suggestion_email: "Correo electrónico inválido.",
      },
    };

    const html = renderToStaticMarkup(<PublicMenuSettingsForm {...propsWithErrors} />);

    expect(html).toContain("El nombre del WiFi excede los 64 caracteres.");
    expect(html).toContain("La clave del WiFi excede los 128 caracteres.");
    expect(html).toContain("Número de WhatsApp inválido.");
    expect(html).toContain("Usuario o enlace de Instagram inválido.");
    expect(html).toContain("Usuario o enlace de Facebook inválido.");
    expect(html).toContain("Usuario o enlace de TikTok inválido.");
    expect(html).toContain("El enlace de Google Reviews debe comenzar con https://");
    expect(html).toContain("El enlace de Google Maps debe comenzar con https://");
    expect(html).toContain("Correo electrónico inválido.");
  });

  it("reflects saving state in the submit button", () => {
    const normalHtml = renderToStaticMarkup(<PublicMenuSettingsForm {...baseProps} />);
    expect(normalHtml).toContain("Guardar Configuración");

    const savingHtml = renderToStaticMarkup(
      <PublicMenuSettingsForm {...baseProps} savingSettings={true} />
    );
    expect(savingHtml).toContain("Guardando...");
  });
});
