/**
 * Pure kitchen-board (KDS) logic extracted from the Cocina component so it can be
 * unit-tested without React, SQLite, or realtime. The component owns rendering and
 * optimistic state; this module owns which comandas belong on the board, the
 * kanban transition math, the persistence ordering, and the auto-print dedup key.
 */

export type ComandaEstado = "pendiente" | "en_preparacion" | "listo" | "entregado";

export interface CocinaComandaItem {
  nombre: string;
  cantidad: number;
  precio: number;
  categoria?: string;
  notas?: string;
}

export interface CocinaComanda {
  id: string;
  tenant_id?: string;
  sucursal_id?: string | null;
  numero_comanda: number;
  mesa_id?: string | null;
  mesa_numero?: number | null;
  estado: ComandaEstado;
  items: CocinaComandaItem[];
  notas?: string | null;
  creado_por?: string | null;
  created_at: string;
  updated_at?: string;
}

/** Estados that keep a comanda visible on the kitchen board. */
export const ACTIVE_ESTADOS = ["pendiente", "en_preparacion", "listo"] as const;

export interface KitchenColumn {
  key: Extract<ComandaEstado, "pendiente" | "en_preparacion" | "listo">;
  title: string;
  color: string;
  next: ComandaEstado;
  nextLabel: string;
}

/** The three kanban columns and the state each "advance" button moves a card to. */
export const KITCHEN_COLUMNS: readonly KitchenColumn[] = [
  { key: "pendiente", title: "Pendientes", color: "#ff906d", next: "en_preparacion", nextLabel: "Mover a preparación" },
  { key: "en_preparacion", title: "En Preparación", color: "#ffd06d", next: "listo", nextLabel: "Listo para entrega" },
  { key: "listo", title: "Listos para entregar", color: "#59ee50", next: "entregado", nextLabel: "Marcar entregado" },
];

export interface BoardScope {
  tenantId: string;
  sucursalId: string | null;
}

/**
 * Keeps only the comandas that belong on this device's board: same tenant (rows
 * with no tenant_id are legacy-permissive), same sucursal (null sucursal is
 * treated as global), and an active estado. Sorted oldest-first so the kitchen
 * works tickets in arrival order.
 */
export function filterActiveComandas(
  rows: readonly CocinaComanda[],
  scope: BoardScope,
): CocinaComanda[] {
  const active = ACTIVE_ESTADOS as readonly string[];
  return rows
    .filter(
      (c) =>
        (!c.tenant_id || c.tenant_id === scope.tenantId) &&
        (!c.sucursal_id || c.sucursal_id === scope.sucursalId) &&
        active.includes(c.estado),
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Stable key used to suppress duplicate auto-prints of the same comanda revision.
 * Two realtime events for the same id and updated_at collapse to one print.
 */
export function comandaDedupKey(
  comanda: Pick<CocinaComanda, "id" | "created_at" | "updated_at">,
  now: () => string = () => new Date().toISOString(),
): string {
  const stamp = new Date(comanda.updated_at || comanda.created_at || now()).getTime();
  return `${comanda.id}_${stamp}`;
}

export interface AdvanceOptions {
  /** ISO timestamp stamped onto the updated rows. */
  now: string;
  sucursalId: string | null;
}

export interface AdvancePlan {
  /** "entregado" removes the card; every other transition rewrites it. */
  action: "delete" | "save";
  /** The comanda row to persist; null when action is "delete". */
  comanda: CocinaComanda | null;
  /** Patch applied to this comanda's consumos, or null when none should change. */
  consumoPatch: { estado: "listo"; updated_at: string } | null;
}

/**
 * Pure transition: given the current comanda and the target estado, decides
 * whether to delete it (delivered) or rewrite it, and whether its consumos must
 * be marked "listo" (so the waiter/checkout screens see the items as ready).
 */
export function planAdvance(
  existing: CocinaComanda | undefined,
  id: string,
  nextEstado: ComandaEstado,
  options: AdvanceOptions,
): AdvancePlan {
  if (nextEstado === "entregado") {
    return { action: "delete", comanda: null, consumoPatch: null };
  }
  const comanda: CocinaComanda = {
    ...(existing ?? ({} as CocinaComanda)),
    id,
    estado: nextEstado,
    updated_at: options.now,
    sucursal_id: options.sucursalId,
  };
  return {
    action: "save",
    comanda,
    consumoPatch: nextEstado === "listo" ? { estado: "listo", updated_at: options.now } : null,
  };
}

export interface AdvancePersistenceDeps {
  saveComanda: (tenantId: string, comanda: CocinaComanda) => Promise<void>;
  deleteComanda: (tenantId: string, id: string) => Promise<void>;
  readConsumos: (
    tenantId: string,
    options: { comandaId: string },
  ) => Promise<Array<Record<string, unknown>>>;
  saveConsumo: (tenantId: string, row: Record<string, unknown>) => Promise<void>;
}

/**
 * Applies an AdvancePlan through injected persistence functions. The comanda is
 * written before its consumos, and only consumos actually linked to the comanda
 * are patched (guards against a reader returning unrelated rows).
 */
export async function persistAdvance(
  deps: AdvancePersistenceDeps,
  tenantId: string,
  id: string,
  plan: AdvancePlan,
): Promise<void> {
  if (plan.action === "delete") {
    await deps.deleteComanda(tenantId, id);
    return;
  }
  await deps.saveComanda(tenantId, plan.comanda as CocinaComanda);
  if (plan.consumoPatch) {
    const patch = plan.consumoPatch;
    const consumos = await deps.readConsumos(tenantId, { comandaId: id });
    await Promise.all(
      consumos
        .filter((c) => (c as { comanda_id?: string | null }).comanda_id === id)
        .map((c) => deps.saveConsumo(tenantId, { ...c, ...patch })),
    );
  }
}
