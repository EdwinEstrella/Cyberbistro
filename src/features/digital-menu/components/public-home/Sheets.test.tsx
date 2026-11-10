import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WifiSheet } from "./WifiSheet";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { SocialSheet } from "./SocialSheet";

describe("WifiSheet", () => {
  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      <WifiSheet
        isOpen={false}
        onClose={vi.fn()}
        wifiName="TestWiFi"
        wifiPassword="pass"
      />
    );
    expect(html).toBe("");
  });

  it("renders network name and password with copy buttons when open", () => {
    const html = renderToStaticMarkup(
      <WifiSheet
        isOpen={true}
        onClose={vi.fn()}
        wifiName="CyberGuest"
        wifiPassword="SecretPassword123"
      />
    );

    expect(html).toContain("Conectate al Wi-Fi");
    expect(html).toContain("CyberGuest");
    expect(html).toContain("SecretPassword123");
    expect(html).toContain('aria-label="Copiar nombre de red"');
    expect(html).toContain('aria-label="Copiar contraseña"');
    expect(html).toContain('aria-label="Cerrar"');
  });

  it("omits password section when password is not configured", () => {
    const html = renderToStaticMarkup(
      <WifiSheet
        isOpen={true}
        onClose={vi.fn()}
        wifiName="OpenCafe"
        wifiPassword=""
      />
    );

    expect(html).toContain("OpenCafe");
    expect(html).not.toContain('aria-label="Copiar contraseña"');
  });
});

describe("WhatsAppSheet", () => {
  it("renders WhatsApp write action and vCard download button", () => {
    const html = renderToStaticMarkup(
      <WhatsAppSheet
        isOpen={true}
        onClose={vi.fn()}
        businessName="Cyber Bistro"
        whatsapp="18095551234"
      />
    );

    expect(html).toContain("Contactanos por WhatsApp");
    expect(html).toContain('href="https://wa.me/18095551234"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Escribir por WhatsApp");
    expect(html).toContain("Guardar contacto");
  });
});

describe("SocialSheet", () => {
  it("renders only configured networks as secure https links", () => {
    const html = renderToStaticMarkup(
      <SocialSheet
        isOpen={true}
        onClose={vi.fn()}
        contact={{
          instagram: "cyber_bistro",
          tiktok: "cyber_bistro",
          facebook: "",
        }}
      />
    );

    expect(html).toContain("Nuestras redes sociales");
    expect(html).toContain('href="https://instagram.com/cyber_bistro"');
    expect(html).toContain('href="https://tiktok.com/@cyber_bistro"');
    expect(html).not.toContain("facebook.com");
  });
});
