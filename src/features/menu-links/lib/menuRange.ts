import { addDays, getMondayOfWeek } from "./menuSchedule";
import { getBusinessIsoDow, getBusinessToday } from "./menuBusinessDate";
import type { MenuDishDraft } from "./types";

const isYmd = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const DOW_NAMES_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

/**
 * Calculates the number of calendar days in a [desde, hasta] range inclusive.
 * Returns 0 if either date is invalid or if hasta < desde.
 */
export function rangeDays(desde: string, hasta: string): number {
  if (!isYmd(desde) || !isYmd(hasta)) return 0;
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
  const t2 = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
  const diffDays = Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
  return diffDays < 0 ? 0 : diffDays + 1;
}

/**
 * Given a [desde, hasta] range (both in the same week or valid),
 * returns the array of ISO day-of-week numbers (1 = Mon .. 7 = Sun) from isodow(desde) to isodow(hasta).
 */
export function weekdaysFromRange(desde: string, hasta: string): number[] {
  if (!isYmd(desde) || !isYmd(hasta)) {
    return [1, 2, 3, 4, 5, 6, 7];
  }
  const startDow = Math.max(1, Math.min(7, getBusinessIsoDow(desde)));
  const endDow = Math.max(1, Math.min(7, getBusinessIsoDow(hasta)));

  if (startDow > endDow) {
    return [startDow];
  }

  const days: number[] = [];
  for (let d = startDow; d <= endDow; d++) {
    days.push(d);
  }
  return days;
}

/**
 * Derives the displayed Desde/Hasta range for an existing menu on load:
 * from weekStart (Monday) plus the min and max weekday among all included dishes.
 * Falls back to Monday..Sunday if no dishes or no weekdays are present.
 */
export function deriveRangeFromWeekdays(
  weekStart: string,
  weekdaysList: number[][]
): { desde: string; hasta: string } {
  const monday = getMondayOfWeek(weekStart || getBusinessToday());
  const sunday = addDays(monday, 6);

  const allDays = (weekdaysList ?? [])
    .flat()
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);

  if (allDays.length === 0) {
    return { desde: monday, hasta: sunday };
  }

  const minDow = Math.min(...allDays);
  const maxDow = Math.max(...allDays);
  const clampedMin = Math.max(1, Math.min(7, minDow));
  const clampedMax = Math.max(clampedMin, Math.min(7, maxDow));

  return {
    desde: addDays(monday, clampedMin - 1),
    hasta: addDays(monday, clampedMax - 1),
  };
}

/**
 * Clamps a [desde, hasta] date range to strictly remain inside the single
 * Monday-to-Sunday week defined by weekStart, and ensures hasta >= desde.
 */
export function clampRangeToWeek(
  weekStart: string,
  desde: string,
  hasta: string
): { desde: string; hasta: string } {
  const monday = getMondayOfWeek(weekStart || getBusinessToday());
  const sunday = addDays(monday, 6);

  let clampedDesde = desde;
  if (!clampedDesde || clampedDesde < monday) clampedDesde = monday;
  else if (clampedDesde > sunday) clampedDesde = sunday;

  let clampedHasta = hasta;
  if (!clampedHasta || clampedHasta > sunday) clampedHasta = sunday;
  else if (clampedHasta < clampedDesde) clampedHasta = clampedDesde;

  return { desde: clampedDesde, hasta: clampedHasta };
}

/**
 * Shifts the [desde, hasta] range when the user selects a new Desde date:
 * - Computes new weekStart = getMondayOfWeek(newDesde).
 * - If newDesde is in a different week, Hasta shifts to the same weekday offset in the new week,
 *   clamped so that Hasta >= Desde and Hasta <= Sunday of the new week.
 * - If newDesde is in the same week, Hasta is kept as-is, clamped so Hasta >= Desde.
 */
export function shiftRangeToWeek(
  oldDesde: string,
  oldHasta: string,
  newDesde: string
): { desde: string; hasta: string; weekStart: string } {
  const newWeekStart = getMondayOfWeek(newDesde);
  const oldWeekStart = oldDesde ? getMondayOfWeek(oldDesde) : newWeekStart;
  const newSunday = addDays(newWeekStart, 6);

  let newHasta: string;

  if (oldWeekStart !== newWeekStart && oldHasta && isYmd(oldHasta)) {
    // Moved to another week: shift Hasta to the same weekday offset in the new week
    const oldHastaDow = getBusinessIsoDow(oldHasta);
    const candidateHasta = addDays(newWeekStart, oldHastaDow - 1);
    if (candidateHasta < newDesde) {
      newHasta = newDesde;
    } else if (candidateHasta > newSunday) {
      newHasta = newSunday;
    } else {
      newHasta = candidateHasta;
    }
  } else {
    // Same week or no valid old range
    if (!oldHasta || oldHasta < newDesde) {
      newHasta = newDesde;
    } else if (oldHasta > newSunday) {
      newHasta = newSunday;
    } else {
      newHasta = oldHasta;
    }
  }

  return {
    desde: newDesde,
    hasta: newHasta,
    weekStart: newWeekStart,
  };
}

/**
 * Formats a date range summary in neutral Spanish, e.g.:
 * "Lun 09/11 al vie 13/11 · 5 días"
 * or for 1 day:
 * "Lun 09/11 · 1 día"
 */
export function formatMenuRangeSummary(desde: string, hasta: string): string {
  if (!isYmd(desde) || !isYmd(hasta)) return "";
  const dow1 = getBusinessIsoDow(desde);
  const dow2 = getBusinessIsoDow(hasta);
  const [, m1, d1] = desde.split("-");
  const [, m2, d2] = hasta.split("-");
  const name1 = DOW_NAMES_SHORT[dow1 - 1] ?? "lun";
  const name2 = DOW_NAMES_SHORT[dow2 - 1] ?? "dom";
  const name1Cap = name1.charAt(0).toUpperCase() + name1.slice(1);
  const days = rangeDays(desde, hasta);
  const daysLabel = days === 1 ? "1 día" : `${days} días`;

  if (desde === hasta) {
    return `${name1Cap} ${d1}/${m1} · ${daysLabel}`;
  }

  return `${name1Cap} ${d1}/${m1} al ${name2} ${d2}/${m2} · ${daysLabel}`;
}

/**
 * Applies a new set of weekdays to all included dish drafts, returning a new Map.
 * Does not mutate the input drafts Map.
 */
export function applyWeekdaysToIncluded(
  drafts: Map<number, MenuDishDraft>,
  weekdays: number[]
): Map<number, MenuDishDraft> {
  const next = new Map(drafts);
  for (const [id, draft] of next.entries()) {
    if (draft.included) {
      next.set(id, { ...draft, weekdays: [...weekdays] });
    }
  }
  return next;
}

/**
 * Creates a default dish draft object with the specified active weekdays.
 * Defaults to full week [1, 2, 3, 4, 5, 6, 7] when not provided.
 */
export function createDefaultDishDraft(
  defaultWeekdays: number[] = [1, 2, 3, 4, 5, 6, 7]
): MenuDishDraft {
  return {
    included: false,
    weekdays: [...defaultWeekdays],
    sort_order: 0,
    display_name: "",
  };
}
