import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomTabBar } from "./BottomTabBar";

describe("BottomTabBar", () => {
  it("renders 3 tabs with role='tab' and minimum 48px touch targets", () => {
    const html = renderToStaticMarkup(
      <BottomTabBar
        activeTab="menu"
        onTabChange={vi.fn()}
        onOpenCart={vi.fn()}
        cartCount={0}
      />
    );

    expect(html).toContain('aria-label="Navegación principal"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain(">Inicio</span>");
    expect(html).toContain(">Servicios</span>");
    expect(html).toContain(">Pedido</span>");
    expect(html).not.toContain("min-h-[48px]");
    expect(html).toContain("min-h-[78px]");
    expect(html).toContain("pb-[calc(14px+env(safe-area-inset-bottom,0px))]");
  });

  it("marks active 'menu' tab with aria-selected and aria-current", () => {
    const html = renderToStaticMarkup(
      <BottomTabBar
        activeTab="menu"
        onTabChange={vi.fn()}
        onOpenCart={vi.fn()}
        cartCount={0}
      />
    );

    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("text-[#fafafa] font-bold");
  });

  it("renders 'Servicios' label for third tab", () => {
    const html = renderToStaticMarkup(
      <BottomTabBar
        activeTab="menu"
        onTabChange={vi.fn()}
        onOpenCart={vi.fn()}
        cartCount={0}
      />
    );

    expect(html).toContain(">Servicios</span>");
    expect(html).not.toContain(">Info</span>");
  });

  it("displays cart badge with count when cartCount > 0", () => {
    const html = renderToStaticMarkup(
      <BottomTabBar
        activeTab="menu"
        onTabChange={vi.fn()}
        onOpenCart={vi.fn()}
        cartCount={5}
      />
    );

    expect(html).toContain('data-testid="bottom-tab-badge"');
    expect(html).toContain(">5</span>");
    expect(html).toContain('aria-label="Pedido (5 items)"');
  });

  it("omits cart badge when cartCount is 0", () => {
    const html = renderToStaticMarkup(
      <BottomTabBar
        activeTab="menu"
        onTabChange={vi.fn()}
        onOpenCart={vi.fn()}
        cartCount={0}
      />
    );

    expect(html).not.toContain('data-testid="bottom-tab-badge"');
  });
});
