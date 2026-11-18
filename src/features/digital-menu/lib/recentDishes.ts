import type { PublicMenuItem } from "../components/PublicMenuOrderScreen";

/**
 * Dishes this device ordered from one public menu, newest first.
 * Only ids and dates are kept: name, price and photo always come from the
 * current menu, so a changed price or a removed dish never shows stale data.
 */
export interface RecentDish {
  platoId: number;
  orderedAt: string;
}

export interface RecentDishEntry {
  item: PublicMenuItem;
  orderedAt: string;
}

export const MAX_RECENT_DISHES = 10;
const STORAGE_PREFIX = "cloudix:public-menu:recent:";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

export function parseRecentDishes(raw: string | null): RecentDish[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is RecentDish =>
      typeof entry === "object" &&
      entry !== null &&
      Number.isInteger((entry as RecentDish).platoId) &&
      typeof (entry as RecentDish).orderedAt === "string" &&
      !Number.isNaN(Date.parse((entry as RecentDish).orderedAt))
  );
}

/** Puts the just-ordered dishes first, drops older duplicates and keeps at most `max`. */
export function mergeRecentDishes(
  existing: RecentDish[],
  platoIds: number[],
  orderedAt: string,
  max = MAX_RECENT_DISHES
): RecentDish[] {
  const fresh = [...new Set(platoIds)].map((platoId) => ({ platoId, orderedAt }));
  const freshIds = new Set(fresh.map((entry) => entry.platoId));
  return [...fresh, ...existing.filter((entry) => !freshIds.has(entry.platoId))].slice(0, max);
}

export function loadRecentDishes(slug: string, storage: StorageLike | null = defaultStorage()): RecentDish[] {
  if (!slug || !storage) return [];
  try {
    return parseRecentDishes(storage.getItem(storageKey(slug)));
  } catch {
    return [];
  }
}

/** Records an order and returns the updated list (also when storage is unavailable). */
export function recordRecentOrder(
  slug: string,
  platoIds: number[],
  orderedAt: Date,
  storage: StorageLike | null = defaultStorage()
): RecentDish[] {
  const next = mergeRecentDishes(loadRecentDishes(slug, storage), platoIds, orderedAt.toISOString());
  if (slug && storage) {
    try {
      storage.setItem(storageKey(slug), JSON.stringify(next));
    } catch {
      // Private mode or full storage: the section still shows this session's order.
    }
  }
  return next;
}

/** Pairs each recent dish with its current menu item, skipping dishes no longer on the menu. */
export function resolveRecentDishes(recent: RecentDish[], items: PublicMenuItem[]): RecentDishEntry[] {
  const byPlatoId = new Map(items.map((item) => [item.plato_id, item]));
  return recent.flatMap((entry) => {
    const item = byPlatoId.get(entry.platoId);
    return item ? [{ item, orderedAt: entry.orderedAt }] : [];
  });
}

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Short label for when a dish was ordered, relative to `now` in local calendar days. */
export function formatOrderedWhen(orderedAt: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(orderedAt)) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return WEEKDAYS[orderedAt.getDay()];
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "Hace 1 sem." : `Hace ${weeks} sem.`;
  return "Hace más de un mes";
}
