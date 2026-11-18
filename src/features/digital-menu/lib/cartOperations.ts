import type { CartLine, PublicMenuItem } from "../components/PublicMenuOrderScreen";

/**
 * Pure function to add an item to the cart with quantity and an optional kitchen note.
 *
 * Semantics:
 * - Cart maintains at most one line per plato_id.
 * - If the item is already in the cart: adds `qty` to existing quantity (capped at 99).
 * - If the item is absent: creates a new line with `qty` (capped at 99, min 1).
 * - `note` is trimmed. If non-empty, sets/replaces line notes. If empty, whitespace-only,
 *   or undefined/null, sets notes to undefined (clearing previous note).
 */
export function addToCartWithNote(
  cart: CartLine[],
  item: PublicMenuItem,
  qty: number,
  note?: string | null
): CartLine[] {
  const cleanQty = Math.max(1, Math.min(99, qty));
  const trimmed = note?.trim();
  const notes = trimmed && trimmed.length > 0 ? trimmed : undefined;

  const existingIndex = cart.findIndex((line) => line.plato_id === item.plato_id);
  if (existingIndex >= 0) {
    const existing = cart[existingIndex];
    const newQty = Math.min(99, existing.quantity + cleanQty);
    const updatedLine: CartLine = {
      ...existing,
      quantity: newQty,
      notes,
    };
    return cart.map((line, idx) => (idx === existingIndex ? updatedLine : line));
  }

  const newLine: CartLine = {
    ...item,
    quantity: cleanQty,
    ...(notes !== undefined ? { notes } : {}),
  };
  return [...cart, newLine];
}
