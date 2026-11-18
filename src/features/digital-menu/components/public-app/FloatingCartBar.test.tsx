import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FloatingCartBar } from "./FloatingCartBar";

describe("FloatingCartBar", () => {
  const formatCurrency = (val: number, cur: string) => `${cur} $${val}`;

  it("renders when itemCount > 0 and visible is true", () => {
    const html = renderToStaticMarkup(
      <FloatingCartBar
        itemCount={3}
        total={450}
        currency="RD$"
        currencyFormatter={formatCurrency}
        onOpenCart={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="floating-cart-bar"');
    expect(html).toContain("Ver pedido");
    expect(html).not.toContain("·");
    expect(html).toMatch(/data-testid="floating-cart-count"[^>]*>3<\/span>/);
    expect(html).toContain("RD$ $450");
    expect(html).toContain("bg-[#ff906d]");
    expect(html).toContain("text-[#5b1600]");
    expect(html).toContain("rounded-[18px]");
  });

  it("is hidden (returns null) when itemCount is 0", () => {
    const html = renderToStaticMarkup(
      <FloatingCartBar
        itemCount={0}
        total={0}
        currency="RD$"
        currencyFormatter={formatCurrency}
        onOpenCart={vi.fn()}
      />
    );

    expect(html).toBe("");
    expect(html).not.toContain("floating-cart-bar");
  });

  it("is hidden when visible prop is false even if itemCount > 0", () => {
    const html = renderToStaticMarkup(
      <FloatingCartBar
        itemCount={2}
        total={200}
        currency="RD$"
        currencyFormatter={formatCurrency}
        onOpenCart={vi.fn()}
        visible={false}
      />
    );

    expect(html).toBe("");
  });
});
