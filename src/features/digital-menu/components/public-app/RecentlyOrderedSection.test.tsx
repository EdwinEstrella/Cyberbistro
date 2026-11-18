import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentlyOrderedSection } from "./RecentlyOrderedSection";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";

const formatCurrency = (value: number, currency: string) => `${currency} ${value}`;

function dish(platoId: number, name: string, image_url: string | null = null): PublicMenuItem {
  return {
    id: `item-${platoId}`,
    plato_id: platoId,
    name,
    description: null,
    image_url,
    price: 275,
    category: "Platos Fuertes",
    sort_order: 0,
  };
}

const now = new Date(2026, 10, 18, 15, 0);

describe("RecentlyOrderedSection", () => {
  it("renders nothing when there are no recent dishes", () => {
    const html = renderToStaticMarkup(
      <RecentlyOrderedSection
        entries={[]}
        now={now}
        currency="RD$"
        currencyFormatter={formatCurrency}
        onRepeat={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(html).toBe("");
  });

  it("renders a card per dish with its when-label, price and a Repetir button", () => {
    const html = renderToStaticMarkup(
      <RecentlyOrderedSection
        entries={[
          { item: dish(1, "Pollo horneado", "https://fotos.azokia.com/t/1.webp"), orderedAt: new Date(2026, 10, 17, 12).toISOString() },
          { item: dish(-1000000007, "Refresco de Lata"), orderedAt: new Date(2026, 10, 18, 9).toISOString() },
        ]}
        now={now}
        currency="RD$"
        currencyFormatter={formatCurrency}
        onRepeat={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain("Lo pediste recientemente");
    expect(html).toContain('data-testid="recent-dish-1"');
    expect(html).toContain('data-testid="recent-dish--1000000007"');
    expect(html).toContain("Pollo horneado");
    expect(html).toContain("Ayer");
    expect(html).toContain("Hoy");
    expect(html).toContain("RD$ 275");
    expect(html).toContain('aria-label="Repetir Pollo horneado"');
    expect(html).toContain('src="https://fotos.azokia.com/t/1.webp"');
    expect(html).toContain("overflow-x-auto");
    // Dish photos are square with the whole product inside; the wide card must not crop them.
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });

  it("never nests the Repetir button inside the card's detail button", () => {
    const html = renderToStaticMarkup(
      <RecentlyOrderedSection
        entries={[{ item: dish(1, "Pollo horneado"), orderedAt: now.toISOString() }]}
        now={now}
        currency="RD$"
        currencyFormatter={formatCurrency}
        onRepeat={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const detailButton = html.match(/<button[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(detailButton).not.toBe("");
    expect(detailButton).not.toContain("Repetir");
  });
});
