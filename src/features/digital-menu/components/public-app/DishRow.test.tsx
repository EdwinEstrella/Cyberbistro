import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DishRow } from "./DishRow";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { renderInFakeDom } from "../../test-utils/fakeDom";

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
    expect(html).toContain("text-[#ff906d]");
    expect(html).toContain("size-[84px]");
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

  describe("tap and stop propagation behavior", () => {
    it("calls onSelect when row is clicked, but not when '+' button is clicked", () => {
      const onSelect = vi.fn();
      const onAdd = vi.fn();

      const { findElement, cleanup } = renderInFakeDom(
        <DishRow
          item={sampleItem}
          quantityInCart={0}
          onAdd={onAdd}
          onUpdateQuantity={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
          onSelect={onSelect}
        />
      );

      const rowBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-haspopup"] === "dialog"
      );
      const plusBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === `Agregar ${sampleItem.name}`
      );

      expect(rowBtn).not.toBeNull();
      expect(plusBtn).not.toBeNull();

      // Click '+' button -> calls onAdd, does NOT call onSelect
      const plusEvent = {
        type: "click",
        bubbles: true,
      };
      plusBtn!.dispatchEvent(plusEvent);

      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();

      // Click row button -> calls onSelect
      const rowEvent = {
        type: "click",
        bubbles: true,
      };
      rowBtn!.dispatchEvent(rowEvent);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(sampleItem);

      cleanup();
    });

    it("stops propagation when stepper buttons are clicked and does not call onSelect", () => {
      const onSelect = vi.fn();
      const onUpdateQuantity = vi.fn();

      const { findElement, cleanup } = renderInFakeDom(
        <DishRow
          item={sampleItem}
          quantityInCart={2}
          onAdd={vi.fn()}
          onUpdateQuantity={onUpdateQuantity}
          currency="DOP"
          currencyFormatter={formatCurrency}
          onSelect={onSelect}
        />
      );

      const decrementBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === `Disminuir cantidad de ${sampleItem.name}`
      );
      const incrementBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === `Aumentar cantidad de ${sampleItem.name}`
      );

      expect(decrementBtn).not.toBeNull();
      expect(incrementBtn).not.toBeNull();

      // Decrement click
      const decEvent = {
        type: "click",
        bubbles: true,
      };
      decrementBtn!.dispatchEvent(decEvent);
      expect(onUpdateQuantity).toHaveBeenCalledWith(1);
      expect(onSelect).not.toHaveBeenCalled();

      // Increment click
      const incEvent = {
        type: "click",
        bubbles: true,
      };
      incrementBtn!.dispatchEvent(incEvent);
      expect(onUpdateQuantity).toHaveBeenCalledWith(3);
      expect(onSelect).not.toHaveBeenCalled();

      cleanup();
    });
  });
});
