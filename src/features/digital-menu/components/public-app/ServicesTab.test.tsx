import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServicesTab } from "./ServicesTab";
import type { PublicContact } from "../../../menu-links/lib/publicMenuCalendar";

describe("ServicesTab", () => {
  const mockContact: PublicContact = {
    whatsapp: "8095551234",
    instagram: "testbistro",
    facebook: "testbistrofb",
    maps_url: "https://maps.google.com",
    google_review_url: "https://google.com/review",
    wifi_name: "TestBistroWiFi",
    wifi_password: "password123",
  };

  it("renders all services in table mode", () => {
    const html = renderToStaticMarkup(
      <ServicesTab
        contact={mockContact}
        isTableMode={true}
        businessName="Test Bistro"
        slug="test-bistro"
        tenantId="tenant-1"
        mesa={1}
      />
    );

    expect(html).toContain('data-testid="service-request-buttons"');
    expect(html).toContain("Llamar al mesero");
    expect(html).toContain("Pedir la cuenta");
    expect(html).toContain("Juegos");
    expect(html).toContain("WiFi");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Redes sociales");
    expect(html).toContain("Calificanos en Google");
    expect(html).toContain("Cómo llegar");
  });

  it("renders limited services in takeout mode", () => {
    const html = renderToStaticMarkup(
      <ServicesTab
        contact={mockContact}
        isTableMode={false}
        businessName="Test Bistro"
        slug="test-bistro"
        tenantId="tenant-1"
        mesa={1}
      />
    );

    expect(html).not.toContain('data-testid="service-request-buttons"');
    expect(html).not.toContain("WiFi");
    expect(html).not.toContain("Juegos");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Redes sociales");
    expect(html).toContain("Calificanos en Google");
    expect(html).toContain("Cómo llegar");
  });
});
