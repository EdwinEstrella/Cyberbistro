import { getBusinessIsoDow, getBusinessToday } from "./menuBusinessDate";

/**
 * Checks if a given YYYY-MM-DD date is a Monday (ISO day of week = 1).
 */
export function isMonday(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return getBusinessIsoDow(dateStr) === 1;
}

/**
 * Adds a specific number of days to a YYYY-MM-DD date string.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Adds weeks to a YYYY-MM-DD date string (weeks * 7 days).
 */
export function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7);
}

/**
 * Given any YYYY-MM-DD date, returns the Monday of that week.
 */
export function getMondayOfWeek(dateStr: string): string {
  const dow = getBusinessIsoDow(dateStr);
  const offset = dow - 1; // 1 (Mon) -> 0, 2 (Tue) -> 1, ..., 7 (Sun) -> 6
  return addDays(dateStr, -offset);
}

/**
 * Formats a week range starting from a Monday (week_start) as:
 * "Semana del lun dd/mm al dom dd/mm"
 */
export function formatWeekRange(weekStart: string): string {
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return "";
  const monday = weekStart;
  const sunday = addDays(monday, 6);

  const formatShort = (dateStr: string) => {
    const [, m, d] = dateStr.split("-");
    return `${d}/${m}`;
  };

  return `Semana del lun ${formatShort(monday)} al dom ${formatShort(sunday)}`;
}

/**
 * Checks whether a weekly menu's week is already in the past (today > week_start + 6).
 */
export function isWeekPast(weekStart: string, today: string = getBusinessToday()): boolean {
  if (!weekStart) return false;
  const sunday = addDays(weekStart, 6);
  return today > sunday;
}

/**
 * Validates weekday selection: must be non-empty, integers 1..7 without duplicates.
 */
export function validateWeekdays(weekdays: number[]): { valid: boolean; error?: string } {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return { valid: false, error: "Debes seleccionar al menos un día de la semana." };
  }
  const validDays = new Set([1, 2, 3, 4, 5, 6, 7]);
  for (const day of weekdays) {
    if (!validDays.has(day)) {
      return { valid: false, error: `Día de semana inválido: ${day}` };
    }
  }
  if (new Set(weekdays).size !== weekdays.length) {
    return { valid: false, error: "Los días no pueden estar duplicados." };
  }
  return { valid: true };
}

/**
 * Validates menu scheduling inputs:
 * - Recurring: valid without week_start.
 * - Weekly: requires week_start and it must be a Monday.
 */
export function validateMenuSchedule(input: {
  schedule_mode: "recurring" | "weekly";
  week_start?: string | null;
}): { valid: boolean; error?: string } {
  if (input.schedule_mode === "recurring") {
    return { valid: true };
  }

  if (!input.week_start) {
    return { valid: false, error: "El menú semanal requiere una fecha de inicio (lunes)." };
  }

  if (!isMonday(input.week_start)) {
    return { valid: false, error: "La fecha de inicio del menú semanal debe ser un lunes." };
  }

  return { valid: true };
}
