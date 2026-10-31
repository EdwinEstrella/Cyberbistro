import type { MenuItem } from "./types";

export interface DraftMenuItem {
  plato_id: number;
  weekdays: number[];
  sort_order: number;
  display_name?: string | null;
}

export interface MenuItemsDiffResult {
  toInsert: Array<{
    plato_id: number;
    weekdays: number[];
    sort_order: number;
    display_name: string | null;
  }>;
  toUpdate: Array<{
    id: string;
    plato_id: number;
    weekdays: number[];
    sort_order: number;
    display_name: string | null;
  }>;
  toDelete: Array<{
    id: string;
    plato_id: number;
  }>;
}

function areWeekdaysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Computes the diff between existing stored menu_items and the new draft state.
 * Detects items to insert, items whose configuration changed (to update), and removed items (to delete).
 */
export function computeMenuItemsDiff(
  existingItems: MenuItem[],
  draftItems: DraftMenuItem[]
): MenuItemsDiffResult {
  const existingByPlatoId = new Map<number, MenuItem>();
  for (const item of existingItems) {
    existingByPlatoId.set(item.plato_id, item);
  }

  const draftPlatoIds = new Set<number>();
  const toInsert: MenuItemsDiffResult["toInsert"] = [];
  const toUpdate: MenuItemsDiffResult["toUpdate"] = [];

  for (const draft of draftItems) {
    draftPlatoIds.add(draft.plato_id);
    const existing = existingByPlatoId.get(draft.plato_id);

    const displayName = draft.display_name?.trim() || null;
    const weekdays = [...new Set(draft.weekdays)].sort((a, b) => a - b);

    if (!existing) {
      toInsert.push({
        plato_id: draft.plato_id,
        weekdays,
        sort_order: draft.sort_order,
        display_name: displayName,
      });
    } else {
      const hasChanged =
        !areWeekdaysEqual(existing.weekdays, weekdays) ||
        existing.sort_order !== draft.sort_order ||
        (existing.display_name ?? null) !== displayName;

      if (hasChanged) {
        toUpdate.push({
          id: existing.id,
          plato_id: draft.plato_id,
          weekdays,
          sort_order: draft.sort_order,
          display_name: displayName,
        });
      }
    }
  }

  const toDelete: MenuItemsDiffResult["toDelete"] = [];
  for (const existing of existingItems) {
    if (!draftPlatoIds.has(existing.plato_id)) {
      toDelete.push({ id: existing.id, plato_id: existing.plato_id });
    }
  }

  return { toInsert, toUpdate, toDelete };
}
