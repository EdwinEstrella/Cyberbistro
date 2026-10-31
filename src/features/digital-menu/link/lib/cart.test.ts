import { describe, expect, it } from "vitest";
import {
  addToCart,
  buildCreateOrderPayload,
  calculateCartItemCount,
  calculateCartTotal,
  calculateLineTotal,
  clearCart,
  pruneCart,
  removeLine,
  updateLineExtras,
  updateLineNotes,
  updateLineQuantity,
} from "./cart";
import type { CartLine, LinkMenuExtra, LinkMenuItem } from "./types";

describe("cart helpers", () => {
  it("calculates line total with dish price and extras correctly", () => {
    const line: CartLine = {
      id: "line-1",
      plato_id: 10,
      name: "Hamburguesa Clásica",
      price: 250,
      quantity: 2,
      extras: [
        { plato_id: 101, name: "Tocineta", price: 50, quantity: 2 },
        { plato_id: 102, name: "Queso Cheddar", price: 30, quantity: 1 },
      ],
    };

    // (250 * 2) + (50 * 2) + (30 * 1) = 500 + 100 + 30 = 630
    expect(calculateLineTotal(line)).toBe(630);
  });

  it("calculates cart total and item count", () => {
    const cart: CartLine[] = [
      {
        id: "line-1",
        plato_id: 1,
        name: "Plato 1",
        price: 100,
        quantity: 2,
        extras: [{ plato_id: 10, name: "Extra", price: 20, quantity: 1 }],
      },
      {
        id: "line-2",
        plato_id: 2,
        name: "Plato 2",
        price: 150,
        quantity: 1,
        extras: [],
      },
    ];

    // line 1: (100 * 2) + 20 = 220
    // line 2: 150 * 1 = 150
    // total = 370
    expect(calculateCartTotal(cart)).toBe(370);
    expect(calculateCartItemCount(cart)).toBe(3);
  });

  it("adds items and merges quantities when dish, notes, and extras are identical", () => {
    let cart: CartLine[] = [];
    cart = addToCart(cart, {
      plato_id: 1,
      name: "Pizza",
      price: 300,
      quantity: 1,
      extras: [],
    });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(1);

    cart = addToCart(cart, {
      plato_id: 1,
      name: "Pizza",
      price: 300,
      quantity: 2,
      extras: [],
    });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);

    // With extras, it creates a separate line if extras differ
    cart = addToCart(cart, {
      plato_id: 1,
      name: "Pizza",
      price: 300,
      quantity: 1,
      extras: [{ plato_id: 5, name: "Extra queso", price: 50, quantity: 1 }],
    });
    expect(cart).toHaveLength(2);
  });

  it("updates line quantity and removes line when quantity is 0", () => {
    const initial: CartLine[] = [
      { id: "1", plato_id: 1, name: "P1", price: 100, quantity: 2, extras: [] },
      { id: "2", plato_id: 2, name: "P2", price: 200, quantity: 1, extras: [] },
    ];

    const updated = updateLineQuantity(initial, "1", 5);
    expect(updated.find((l) => l.id === "1")?.quantity).toBe(5);

    const removed = updateLineQuantity(updated, "1", 0);
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe("2");
  });

  it("removes line and updates extras and notes", () => {
    const initial: CartLine[] = [
      { id: "1", plato_id: 1, name: "P1", price: 100, quantity: 1, extras: [] },
    ];

    const withExtras = updateLineExtras(initial, "1", [
      { plato_id: 10, name: "E1", price: 25, quantity: 2 },
      { plato_id: 11, name: "E2", price: 15, quantity: 0 }, // filtered out
    ]);
    expect(withExtras[0].extras).toHaveLength(1);
    expect(withExtras[0].extras[0].plato_id).toBe(10);

    const withNotes = updateLineNotes(withExtras, "1", "Sin cebolla");
    expect(withNotes[0].notes).toBe("Sin cebolla");

    const empty = removeLine(withNotes, "1");
    expect(empty).toHaveLength(0);

    expect(clearCart()).toEqual([]);
  });

  it("builds create_order_by_link payload with NO prices and correctly nested extras", () => {
    const cart: CartLine[] = [
      {
        id: "line-1",
        plato_id: 42,
        name: "Sándwich",
        price: 350, // NEVER sent in payload
        quantity: 2,
        notes: "Bien tostado",
        extras: [
          { plato_id: 99, name: "Papas", price: 100, quantity: 1 },
          { plato_id: 100, name: "Salsa", price: 20, quantity: 0 }, // filtered out
        ],
      },
    ];

    const payload = buildCreateOrderPayload(
      "secret-token-123",
      " Juan Pérez ",
      " Entregar en recepción ",
      cart,
      "session-abc"
    );

    expect(payload).toEqual({
      p_token: "secret-token-123",
      p_employee_name: "Juan Pérez",
      p_notes: "Entregar en recepción",
      p_session_id: "session-abc",
      p_items: [
        {
          plato_id: 42,
          quantity: 2,
          notes: "Bien tostado",
          extras: [
            {
              plato_id: 99,
              quantity: 1,
            },
          ],
        },
      ],
    });

    // Verify price is never present
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain("350");
    expect(payloadStr).not.toContain("price");
  });

  it("prunes unavailable dishes and dropped extras after menu reload", () => {
    const cart: CartLine[] = [
      {
        id: "l1",
        plato_id: 1,
        name: "Plato Disponible",
        price: 100,
        quantity: 1,
        extras: [
          { plato_id: 10, name: "Extra Válido", price: 20, quantity: 1 },
          { plato_id: 11, name: "Extra Agotado", price: 30, quantity: 1 },
        ],
      },
      {
        id: "l2",
        plato_id: 2,
        name: "Plato Agotado",
        price: 150,
        quantity: 1,
        extras: [],
      },
    ];

    const availableItems: LinkMenuItem[] = [
      {
        id: "m1",
        plato_id: 1,
        name: "Plato Disponible",
        description: null,
        image_url: null,
        price: 100,
        category: "General",
        sort_order: 1,
      },
    ];

    const availableExtras: LinkMenuExtra[] = [
      {
        id: "e1",
        plato_id: 10,
        name: "Extra Válido",
        description: null,
        image_url: null,
        price: 20,
        category: "Extras",
        sort_order: 1,
      },
    ];

    const result = pruneCart(cart, availableItems, availableExtras);

    expect(result.removedLines).toEqual(["Plato Agotado"]);
    expect(result.removedExtras).toEqual(["Extra Agotado"]);
    expect(result.prunedCart).toHaveLength(1);
    expect(result.prunedCart[0].plato_id).toBe(1);
    expect(result.prunedCart[0].extras).toHaveLength(1);
    expect(result.prunedCart[0].extras[0].plato_id).toBe(10);
  });
});
