import { describe, expect, it } from "vitest";
import { addToCartWithNote } from "./cartOperations";
import type { CartLine, PublicMenuItem } from "../components/PublicMenuOrderScreen";

describe("addToCartWithNote pure function", () => {
  const itemA: PublicMenuItem = {
    id: "item-1",
    plato_id: 101,
    name: "Mofongo de Chicharrón",
    description: "Plátano verde majado con ajo y chicharrón crujiente",
    image_url: "https://example.com/mofongo.jpg",
    price: 450,
    category: "Platos Fuertes",
    sort_order: 1,
  };

  const itemB: PublicMenuItem = {
    id: "item-2",
    plato_id: 102,
    name: "Jugo de Chinola",
    description: "Natural y refrescante",
    image_url: null,
    price: 150,
    category: "Bebidas",
    sort_order: 2,
  };

  it("creates a new cart line when item is not in cart", () => {
    const cart: CartLine[] = [];
    const result = addToCartWithNote(cart, itemA, 2, "sin ajo");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ...itemA,
      quantity: 2,
      notes: "sin ajo",
    });
    // Verifies immutability
    expect(cart).toHaveLength(0);
  });

  it("adds quantity to existing line when item is already in cart", () => {
    const initialCart: CartLine[] = [
      {
        ...itemA,
        quantity: 2,
        notes: "sin ajo",
      },
    ];

    const result = addToCartWithNote(initialCart, itemA, 3, "con extra chicharrón");

    expect(result).toHaveLength(1);
    expect(result[0].plato_id).toBe(101);
    expect(result[0].quantity).toBe(5);
    expect(result[0].notes).toBe("con extra chicharrón");
  });

  it("caps total line quantity at 99 when adding to existing line", () => {
    const initialCart: CartLine[] = [
      {
        ...itemA,
        quantity: 95,
      },
    ];

    const result = addToCartWithNote(initialCart, itemA, 10);
    expect(result[0].quantity).toBe(99);
  });

  it("caps quantity at 99 when creating a new line with quantity > 99", () => {
    const result = addToCartWithNote([], itemA, 150);
    expect(result[0].quantity).toBe(99);
  });

  it("enforces minimum quantity of 1 for new items even if qty <= 0", () => {
    const result = addToCartWithNote([], itemA, 0);
    expect(result[0].quantity).toBe(1);
  });

  it("trims whitespace from notes", () => {
    const result = addToCartWithNote([], itemA, 1, "   poca sal y bien caliente   ");
    expect(result[0].notes).toBe("poca sal y bien caliente");
  });

  it("sets notes to undefined if note is empty string or only whitespace", () => {
    const resultEmpty = addToCartWithNote([], itemA, 1, "");
    expect(resultEmpty[0].notes).toBeUndefined();

    const resultSpaces = addToCartWithNote([], itemA, 1, "    ");
    expect(resultSpaces[0].notes).toBeUndefined();
  });

  it("clears previously set note when empty note is passed for an existing line", () => {
    const initialCart: CartLine[] = [
      {
        ...itemA,
        quantity: 1,
        notes: "sin cebolla",
      },
    ];

    const result = addToCartWithNote(initialCart, itemA, 1, "  ");
    expect(result[0].quantity).toBe(2);
    expect(result[0].notes).toBeUndefined();
  });

  it("keeps multiple distinct dishes separate (one line per plato_id)", () => {
    const initialCart: CartLine[] = [
      {
        ...itemA,
        quantity: 1,
        notes: "bien cocido",
      },
    ];

    const result = addToCartWithNote(initialCart, itemB, 2, "frío");
    expect(result).toHaveLength(2);
    expect(result[0].plato_id).toBe(101);
    expect(result[0].quantity).toBe(1);
    expect(result[0].notes).toBe("bien cocido");

    expect(result[1].plato_id).toBe(102);
    expect(result[1].quantity).toBe(2);
    expect(result[1].notes).toBe("frío");
  });
});
