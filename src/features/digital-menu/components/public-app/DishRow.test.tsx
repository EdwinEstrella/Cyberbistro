import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DishRow } from "./DishRow";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";

describe("DishRow", () => {
  const sampleItem: PublicMenuItem = {
    id: "item-1",
    plato_id: 101,
    name: "Hamburguesa Trufada",
    description: "Carne angus, queso brie y aceite de trufa",
    image_url: "https://example.com/burger.jpg",
    price: 650,
    category: "Principales",
    sort_order: 1,
  };

  const formatCurrency = (val: number, cur: string) => `${cur} $${val}`;

  it("renders dish information with name, description, price, and thumbnail", () => {
    const html = renderToStaticMarkup(
      <DishRow
        item={sampleItem}
        quantityInCart={0}
        onAdd={vi.fn()}
        onUpdateQuantity={vi.fn()}
        currency="DOP"
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Hamburguesa Trufada");
    expect(html).toContain("Carne angus, queso brie y aceite de trufa");
    expect(html).toContain("DOP $650");
    expect(html).toContain('alt="Hamburguesa Trufada"');
  });

  it("renders round '+' add button when quantity in cart is 0", () => {
    const html = renderToStaticMarkup(
      <DishRow
        item={sampleItem}
        quantityInCart={0}
        onAdd={vi.fn()}
        onUpdateQuantity={vi.fn()}
        currency="DOP"
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain('aria-label="Agregar Hamburguesa Trufada"');
    expect(html).not.toContain('data-testid="stepper-count-101"');
  });

  it("renders stepper with quantity count and controls when quantity in cart > 0", () => {
    const html = renderToStaticMarkup(
      <DishRow
        item={sampleItem}
        quantityInCart={3}
        onAdd={vi.fn()}
        onUpdateQuantity={vi.fn()}
        currency="DOP"
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain('data-testid="stepper-count-101"');
    expect(html).toContain(">3</span>");
    expect(html).toContain('aria-label="Disminuir cantidad de Hamburguesa Trufada"');
    expect(html).toContain('aria-label="Aumentar cantidad de Hamburguesa Trufada"');
  });

  it("disables increment button when bound reaches 99", () => {
    const html = renderToStaticMarkup(
      <DishRow
        item={sampleItem}
        quantityInCart={99}
        onAdd={vi.fn()}
        onUpdateQuantity={vi.fn()}
        currency="DOP"
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain(">99</span>");
    expect(html).toContain('disabled=""');
  });

  it("renders fallback image icon when dish has no image_url", () => {
    const itemNoImage: PublicMenuItem = {
      ...sampleItem,
      image_url: null,
    };

    const html = renderToStaticMarkup(
      <DishRow
        item={itemNoImage}
        quantityInCart={0}
        onAdd={vi.fn()}
        onUpdateQuantity={vi.fn()}
        currency="DOP"
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain('aria-label="Sin imagen para Hamburguesa Trufada"');
  });
});
