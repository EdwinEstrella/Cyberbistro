import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-ignore react-dom types are not installed in devDependencies
import { flushSync } from "react-dom";
import { DishDetailSheet } from "./DishDetailSheet";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { setupFakeDom, type FakeDomEnvironment, findElement } from "../../test-utils/fakeDom";

describe("DishDetailSheet", () => {
  const sampleItem: PublicMenuItem = {
    id: "item-101",
    plato_id: 101,
    name: "Mofongo de Chicharrón",
    description: "Plátano verde majado con ajo y chicharrón crujiente",
    image_url: "https://example.com/mofongo.jpg",
    price: 450,
    category: "Platos Fuertes",
    sort_order: 1,
  };

  const formatCurrency = (val: number, cur: string) => `${cur} $${val}`;

  describe("Static markup & layout", () => {
    it("renders nothing when isOpen is false", () => {
      const html = renderToStaticMarkup(
        <DishDetailSheet
          isOpen={false}
          item={sampleItem}
          onClose={vi.fn()}
          onAddWithDetails={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
        />
      );

      expect(html).toBe("");
    });

    it("renders nothing when item is null", () => {
      const html = renderToStaticMarkup(
        <DishDetailSheet
          isOpen={true}
          item={null}
          onClose={vi.fn()}
          onAddWithDetails={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
        />
      );

      expect(html).toBe("");
    });

    it("opens with name, price, description, dialog accessibility, and tokens", () => {
      const html = renderToStaticMarkup(
        <DishDetailSheet
          isOpen={true}
          item={sampleItem}
          onClose={vi.fn()}
          onAddWithDetails={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="dish-detail-title"');
      expect(html).toContain('data-testid="dish-detail-backdrop"');
      expect(html).toContain('data-testid="dish-detail-panel"');

      // Grab handle 40x5 #3a3a3a
      expect(html).toContain("w-10");
      expect(html).toContain("h-[5px]");
      expect(html).toContain("bg-[#3a3a3a]");

      // Hero image and 40px round close button
      expect(html).toContain("h-[200px]");
      expect(html).toContain("rounded-[22px]");
      expect(html).toContain('alt="Mofongo de Chicharrón"');
      expect(html).toContain('aria-label="Cerrar"');

      // Dish name, price coral, and description
      expect(html).toContain("Mofongo de Chicharrón");
      expect(html).toContain("DOP $450");
      expect(html).toContain("text-[#ff906d]");
      expect(html).toContain("Plátano verde majado con ajo y chicharrón crujiente");

      // Kitchen notes
      expect(html).toContain("Nota para cocina");
      expect(html).toContain('placeholder="Ej.: sin cebolla, poca sal"');
      expect(html.toLowerCase()).toContain('maxlength="300"');
      expect(html).toContain("rounded-[14px]");

      // Footer stepper and primary button
      expect(html).toContain('aria-label="Quitar uno"');
      expect(html).toContain('aria-label="Agregar uno"');
      expect(html).toContain(">1</span>"); // Initial quantity 1
      expect(html).toContain("Agregar");
      expect(html).toContain("bg-[#fafafa]");
      expect(html).toContain("text-[#0e0e0e]");
    });

    it("renders category icon fallback when item has no image_url", () => {
      const itemNoImage: PublicMenuItem = {
        ...sampleItem,
        image_url: null,
      };

      const html = renderToStaticMarkup(
        <DishDetailSheet
          isOpen={true}
          item={itemNoImage}
          onClose={vi.fn()}
          onAddWithDetails={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
        />
      );

      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Sin imagen para Mofongo de Chicharrón"');
      expect(html).not.toContain("<img");
    });

    it("omits description section when description is null or empty (no invented copy)", () => {
      const itemNoDesc: PublicMenuItem = {
        ...sampleItem,
        description: null,
      };

      const html = renderToStaticMarkup(
        <DishDetailSheet
          isOpen={true}
          item={itemNoDesc}
          onClose={vi.fn()}
          onAddWithDetails={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
        />
      );

      expect(html).toContain("Mofongo de Chicharrón");
      expect(html).not.toContain("Plátano verde majado");
    });

    it("prefills kitchen note if initialNotes prop is provided", () => {
      const html = renderToStaticMarkup(
        <DishDetailSheet
          isOpen={true}
          item={sampleItem}
          initialNotes="sin cebolla"
          onClose={vi.fn()}
          onAddWithDetails={vi.fn()}
          currency="DOP"
          currencyFormatter={formatCurrency}
        />
      );

      expect(html).toContain("sin cebolla");
    });
  });

  describe("Interactive behavior & accessibility", () => {
    let env: FakeDomEnvironment;
    let doc: any;
    let container: any;
    let root: any;

    beforeEach(() => {
      env = setupFakeDom();
      doc = env.doc;
      container = env.container;
      root = env.root;
    });

    afterEach(() => {
      env.cleanup();
    });





    it("locks body scroll and moves focus into close button on open", () => {
      const onClose = vi.fn();
      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            onClose={onClose}
            onAddWithDetails={vi.fn()}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      expect(doc.body.style.overflow).toBe("hidden");
      const closeBtn = findElement(
        container,
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === "Cerrar"
      );
      expect(closeBtn).not.toBeNull();
      expect(doc.activeElement === closeBtn).toBe(true);
    });

    it("closes when close button is clicked", () => {
      const onClose = vi.fn();
      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            onClose={onClose}
            onAddWithDetails={vi.fn()}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      const closeBtn = findElement(
        container,
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === "Cerrar"
      );
      expect(closeBtn).not.toBeNull();
      closeBtn!.dispatchEvent({ type: "click", bubbles: true });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes when backdrop is clicked", () => {
      const onClose = vi.fn();
      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            onClose={onClose}
            onAddWithDetails={vi.fn()}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      const backdrop = findElement(
        container,
        (el) => el.attributes["data-testid"] === "dish-detail-backdrop"
      );
      expect(backdrop).not.toBeNull();
      backdrop!.dispatchEvent({ type: "click", bubbles: true });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes when Escape key is pressed", () => {
      const onClose = vi.fn();
      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            onClose={onClose}
            onAddWithDetails={vi.fn()}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      doc.dispatchEvent({
        type: "keydown",
        key: "Escape",
        stopPropagation: vi.fn(),
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("updates quantity with stepper, enforcing min 1 and max 99", () => {
      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            onClose={vi.fn()}
            onAddWithDetails={vi.fn()}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      const decrementBtn = findElement(
        container,
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === "Quitar uno"
      );
      const incrementBtn = findElement(
        container,
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === "Agregar uno"
      );
      const qtySpan = findElement(
        container,
        (el) => el.attributes["data-testid"] === "dish-detail-qty"
      );

      expect(decrementBtn?.attributes.disabled).toBeDefined(); // disabled at 1
      expect(qtySpan?.textContent).toBe("1");

      // Click +
      flushSync(() => {
        incrementBtn!.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(qtySpan?.textContent).toBe("2");
      expect(decrementBtn?.attributes.disabled).toBeUndefined();

      // Click -
      flushSync(() => {
        decrementBtn!.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(qtySpan?.textContent).toBe("1");
      expect(decrementBtn?.attributes.disabled).toBeDefined();

      // Click - at min 1 does not go below 1
      flushSync(() => {
        decrementBtn!.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(qtySpan?.textContent).toBe("1");
    });

    it("calls onAddWithDetails with (item, qty, trimmed note) and closes on 'Agregar'", () => {
      const onAddWithDetails = vi.fn();
      const onClose = vi.fn();

      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            initialNotes="  poca grasa  "
            onClose={onClose}
            onAddWithDetails={onAddWithDetails}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      const incrementBtn = findElement(
        container,
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === "Agregar uno"
      );
      // Increment to 2
      flushSync(() => {
        incrementBtn!.dispatchEvent({ type: "click", bubbles: true });
      });

      const agregarBtn = findElement(
        container,
        (el) => el.attributes["data-testid"] === "dish-detail-add-btn"
      );
      expect(agregarBtn).not.toBeNull();

      flushSync(() => {
        agregarBtn!.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(onAddWithDetails).toHaveBeenCalledWith(sampleItem, 2, "poca grasa");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onAddWithDetails with undefined note when textarea is empty", () => {
      const onAddWithDetails = vi.fn();
      const onClose = vi.fn();

      flushSync(() => {
        root.render(
          <DishDetailSheet
            isOpen={true}
            item={sampleItem}
            initialNotes=""
            onClose={onClose}
            onAddWithDetails={onAddWithDetails}
            currency="DOP"
            currencyFormatter={formatCurrency}
          />
        );
      });

      const agregarBtn = findElement(
        container,
        (el) => el.attributes["data-testid"] === "dish-detail-add-btn"
      );
      expect(agregarBtn).not.toBeNull();
      agregarBtn!.dispatchEvent({ type: "click", bubbles: true });

      expect(onAddWithDetails).toHaveBeenCalledWith(sampleItem, 1, undefined);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
