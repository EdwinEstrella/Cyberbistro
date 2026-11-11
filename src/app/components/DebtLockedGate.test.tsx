import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DebtLockedGate } from "./DebtLockedGate";
import { SUPPORT_WHATSAPP_BLOCKED_URL } from "../../shared/lib/support";

describe("DebtLockedGate", () => {
  it("static render contains the business name, amount, the support link and the two buttons", () => {
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

    // Support link
    expect(html).toContain(SUPPORT_WHATSAPP_BLOCKED_URL);

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
});
