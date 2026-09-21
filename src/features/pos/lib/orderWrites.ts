/**
 * Pure builders for the "enviar a cocina" write set, extracted from the POS
 * component so every branch (kitchen / direct / mixed) is unit-testable without
 * React, the printer, or the network. The component only wires these to the
 * SQLite local-first save functions and to the panel refresh.
 */

export interface OrderCartLine {
  plato: {
    id: number;
    nombre: string;
    precio: number;
    categoria: string;
    /** false = served directly (no kitchen ticket); anything else goes to the kitchen. */
    va_a_cocina: boolean;
  };
  cantidad: number;
}

export interface OrderWriteContext {
  tenantId: string;
  sucursalId: string;
  mesaNumero: number;
  userId: string | null;
  /** Raw order notes; trimmed here, empty becomes null. */
  notes: string;
  /** Injectable for deterministic tests; defaults to crypto.randomUUID(). */
  newId?: () => string;
  /** Injectable for deterministic tests; defaults to new Date().toISOString(). */
  now?: () => string;
}

export interface OrderWrites {
  /** The kitchen comanda to persist and print, or null when nothing goes to the kitchen. */
  comanda: Record<string, unknown> | null;
  comandaId: string | null;
  /** One consumo per cart line (kitchen + direct), in cart order. */
  consumos: Array<Record<string, unknown>>;
}

/** Kitchen items keep va_a_cocina !== false; only va_a_cocina === false is direct. */
export function splitCartByDestination(cart: readonly OrderCartLine[]): {
  kitchenItems: OrderCartLine[];
  directItems: OrderCartLine[];
} {
  return {
    kitchenItems: cart.filter((i) => i.plato.va_a_cocina !== false),
    directItems: cart.filter((i) => i.plato.va_a_cocina === false),
  };
}

/**
 * Builds the comanda (kitchen only) and the consumos for every cart line.
 * Kitchen lines link to the comanda (estado "enviado_cocina"); direct lines are
 * unlinked and already "entregado". Behaviour mirrors the previous inline code.
 */
export function buildOrderWrites(cart: readonly OrderCartLine[], ctx: OrderWriteContext): OrderWrites {
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const now = ctx.now ?? (() => new Date().toISOString());
  const { kitchenItems, directItems } = splitCartByDestination(cart);

  let comanda: Record<string, unknown> | null = null;
  let comandaId: string | null = null;

  if (kitchenItems.length > 0) {
    comandaId = newId();
    comanda = {
      id: comandaId,
      mesa_numero: ctx.mesaNumero,
      estado: "pendiente",
      items: kitchenItems.map((i) => ({
        nombre: i.plato.nombre,
        categoria: i.plato.categoria || "General",
        cantidad: i.cantidad,
        precio: i.plato.precio,
      })),
      notas: ctx.notes.trim() || null,
      tenant_id: ctx.tenantId,
      sucursal_id: ctx.sucursalId,
      creado_por: ctx.userId,
      created_at: now(),
      updated_at: now(),
    };
  }

  const consumos: Array<Record<string, unknown>> = [
    ...kitchenItems.map((i) => ({
      id: newId(),
      mesa_numero: ctx.mesaNumero,
      tenant_id: ctx.tenantId,
      sucursal_id: ctx.sucursalId,
      comanda_id: comandaId,
      plato_id: i.plato.id,
      nombre: i.plato.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.plato.precio,
      subtotal: i.plato.precio * i.cantidad,
      tipo: "cocina" as const,
      estado: "enviado_cocina" as const,
      created_by_auth_user_id: ctx.userId,
      created_at: now(),
      updated_at: now(),
    })),
    ...directItems.map((i) => ({
      id: newId(),
      mesa_numero: ctx.mesaNumero,
      tenant_id: ctx.tenantId,
      sucursal_id: ctx.sucursalId,
      comanda_id: null,
      plato_id: i.plato.id,
      nombre: i.plato.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.plato.precio,
      subtotal: i.plato.precio * i.cantidad,
      tipo: "directo" as const,
      estado: "entregado" as const,
      created_by_auth_user_id: ctx.userId,
      created_at: now(),
      updated_at: now(),
    })),
  ];

  return { comanda, comandaId, consumos };
}

export interface OrderWriteDeps {
  saveComanda: (tenantId: string, payload: Record<string, unknown>) => Promise<void>;
  saveConsumo: (tenantId: string, payload: Record<string, unknown>) => Promise<void>;
}

/**
 * Persists the order through the SQLite local-first path (the injected saves),
 * comanda first so the consumo → comanda foreign key resolves. This is the only
 * write path: there is no IndexedDB fallback here.
 */
export async function persistOrderWrites(
  deps: OrderWriteDeps,
  tenantId: string,
  writes: OrderWrites,
): Promise<void> {
  if (writes.comanda) {
    await deps.saveComanda(tenantId, writes.comanda);
  }
  for (const consumo of writes.consumos) {
    await deps.saveConsumo(tenantId, consumo);
  }
}
