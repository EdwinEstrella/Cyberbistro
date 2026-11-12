import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DebtLockedGate } from "./DebtLockedGate";
import {
  SUPPORT_WHATSAPP_PHONE,
  formatSupportPhone,
} from "../../shared/lib/support";

describe("DebtLockedGate", () => {
  it("static render contains the business name, amount, the formatted support phone and the two buttons", () => {
    const businessName = "Pizzería Roma";
    const debt = {
      amount: 7500,
      currency: "DOP" as const,
      dueDate: "2026-11-05",
    };
    const status = {
      kind: "locked" as const,
      daysOverdue: 6,
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DebtLockedGate
          businessName={businessName}
          debt={debt}
          status={status}
          onRecheck={vi.fn()}
          onSignOut={vi.fn()}
        />
      </MemoryRouter>
    );

    // Business name
    expect(html).toContain("Pizzería Roma");

    // Amount
    expect(html).toContain("RD$ 7,500.00");

    // Support phone as plain text without link/href
    expect(html).toContain(`Contacto: ${formatSupportPhone(SUPPORT_WHATSAPP_PHONE)}`);
    expect(html).toContain("+1 (809) 596-8986");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("href");

    // Two buttons
    expect(html).toContain("Ya pagué, verificar");
    expect(html).toContain("Cerrar sesión");

    // High contrast verification
    expect(html).toContain("text-gray-100");
    expect(html).not.toContain("text-gray-400");
  });

  it("renders USD currency format accurately", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DebtLockedGate
          businessName="Café Bistro"
          debt={{ amount: 120, currency: "USD", dueDate: "2026-11-01" }}
          status={{ kind: "locked", daysOverdue: 10 }}
          onRecheck={vi.fn()}
          onSignOut={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(html).toContain("US$ 120.00");
    expect(html).toContain("Café Bistro");
  });

  it("formats support phone number accurately", () => {
    expect(formatSupportPhone(SUPPORT_WHATSAPP_PHONE)).toBe("+1 (809) 596-8986");
    expect(formatSupportPhone("8095968986")).toBe("+1 (809) 596-8986");
    expect(formatSupportPhone("+18095968986")).toBe("+1 (809) 596-8986");
    expect(formatSupportPhone("123")).toBe("123");
  });
});
