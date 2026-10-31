import type {
  CartExtra,
  CartLine,
  CreateOrderRpcArgs,
  LinkMenuExtra,
  LinkMenuItem,
} from "./types";

/**
 * Calculates the total price for a single cart line:
 * Line total = (dish price × qty) + Σ(extra price × extra qty)
 */
export function calculateLineTotal(line: CartLine): number {
  const dishSubtotal = (line.price || 0) * (line.quantity || 0);
  const extrasSubtotal = (line.extras || []).reduce(
    (sum, extra) => sum + (extra.price || 0) * (extra.quantity || 0),
    0
  );
  return dishSubtotal + extrasSubtotal;
}

/**
 * Calculates the total price for all lines in the cart.
 */
export function calculateCartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + calculateLineTotal(line), 0);
}

/**
 * Calculates the total count of items in the cart (sum of main dish quantities).
 */
export function calculateCartItemCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + (line.quantity || 0), 0);
}

function areExtrasEqual(a: CartExtra[], b: CartExtra[]): boolean {
  const aFiltered = a.filter((e) => e.quantity > 0).sort((x, y) => x.plato_id - y.plato_id);
  const bFiltered = b.filter((e) => e.quantity > 0).sort((x, y) => x.plato_id - y.plato_id);

  if (aFiltered.length !== bFiltered.length) return false;
  for (let i = 0; i < aFiltered.length; i++) {
    if (
      aFiltered[i].plato_id !== bFiltered[i].plato_id ||
      aFiltered[i].quantity !== bFiltered[i].quantity
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Adds an item with quantity, notes, and extras to the cart.
 * If an identical line already exists (same dish, notes, and extras), merges quantities.
 */
export function addToCart(
  cart: CartLine[],
  item: {
    plato_id: number;
    name: string;
    price: number;
    quantity?: number;
    notes?: string;
    extras?: CartExtra[];
  }
): CartLine[] {
  const quantity = Math.max(1, item.quantity ?? 1);
  const notes = item.notes?.trim() || undefined;
  const extras = (item.extras || []).filter((e) => e.quantity > 0);

  const existingIndex = cart.findIndex(
    (line) =>
      line.plato_id === item.plato_id &&
      (line.notes || "") === (notes || "") &&
      areExtrasEqual(line.extras || [], extras)
  );

  if (existingIndex >= 0) {
    return cart.map((line, idx) =>
      idx === existingIndex
        ? { ...line, quantity: line.quantity + quantity }
        : line
    );
  }

  const newLine: CartLine = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    plato_id: item.plato_id,
    name: item.name,
    price: item.price,
    quantity,
    notes,
    extras,
  };

  return [...cart, newLine];
}

/**
 * Updates the quantity of a specific cart line by its id.
 * If quantity <= 0, the line is removed from the cart.
 */
export function updateLineQuantity(
  cart: CartLine[],
  lineId: string,
  quantity: number
): CartLine[] {
  if (quantity <= 0) {
    return cart.filter((line) => line.id !== lineId);
  }
  return cart.map((line) =>
    line.id === lineId ? { ...line, quantity } : line
  );
}

/**
 * Removes a specific line from the cart.
 */
export function removeLine(cart: CartLine[], lineId: string): CartLine[] {
  return cart.filter((line) => line.id !== lineId);
}

/**
 * Updates the extras attached to a specific line.
 */
export function updateLineExtras(
  cart: CartLine[],
  lineId: string,
  extras: CartExtra[]
): CartLine[] {
  const filteredExtras = extras.filter((e) => e.quantity > 0);
  return cart.map((line) =>
    line.id === lineId ? { ...line, extras: filteredExtras } : line
  );
}

/**
 * Updates notes for a specific line.
 */
export function updateLineNotes(
  cart: CartLine[],
  lineId: string,
  notes: string
): CartLine[] {
  const trimmed = notes.trim() || undefined;
  return cart.map((line) =>
    line.id === lineId ? { ...line, notes: trimmed } : line
  );
}

/**
 * Returns an empty cart.
 */
export function clearCart(): CartLine[] {
  return [];
}

/**
 * Builds the RPC arguments payload for `create_order_by_link`.
 * IMPORTANT: NEVER sends prices.
 */
export function buildCreateOrderPayload(
  token: string,
  employeeName: string | null | undefined,
  notes: string | null | undefined,
  cart: CartLine[],
  sessionId: string | null | undefined
): CreateOrderRpcArgs {
  return {
    p_token: token.trim(),
    p_employee_name: employeeName?.trim() || null,
    p_notes: notes?.trim() || null,
    p_items: cart.map((line) => ({
      plato_id: line.plato_id,
      quantity: line.quantity,
      notes: line.notes?.trim() || null,
      extras: (line.extras || [])
        .filter((extra) => extra.quantity > 0)
        .map((extra) => ({
          plato_id: extra.plato_id,
          quantity: extra.quantity,
        })),
    })),
    p_session_id: sessionId?.trim() || null,
  };
}

/**
 * Prunes unavailable dishes or extras from the cart after reloading the menu.
 * Returns the pruned cart along with names of dropped dishes and extras.
 */
export function pruneCart(
  cart: CartLine[],
  availableItems: LinkMenuItem[],
  availableExtras: LinkMenuExtra[]
): {
  prunedCart: CartLine[];
  removedLines: string[];
  removedExtras: string[];
} {
  const availableItemIds = new Set(availableItems.map((item) => item.plato_id));
  const availableExtraIds = new Set(availableExtras.map((extra) => extra.plato_id));

  const removedLinesSet = new Set<string>();
  const removedExtrasSet = new Set<string>();

  const prunedCart: CartLine[] = [];

  for (const line of cart) {
    if (!availableItemIds.has(line.plato_id)) {
      removedLinesSet.add(line.name);
      continue;
    }

    const validExtras: CartExtra[] = [];
    for (const extra of line.extras || []) {
      if (availableExtraIds.has(extra.plato_id)) {
        validExtras.push(extra);
      } else {
        removedExtrasSet.add(extra.name);
      }
    }

    prunedCart.push({
      ...line,
      extras: validExtras,
    });
  }

  return {
    prunedCart,
    removedLines: Array.from(removedLinesSet),
    removedExtras: Array.from(removedExtrasSet),
  };
}
