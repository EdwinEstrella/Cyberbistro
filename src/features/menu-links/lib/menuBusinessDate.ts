import { BUSINESS_TIMEZONE } from "../../../shared/lib/businessDate";

// re-exported from shared/lib/businessDate for existing imports
export { BUSINESS_TIMEZONE };

/**
 * Returns the current date formatted as 'YYYY-MM-DD' in America/Santo_Domingo.
 */
export function getBusinessToday(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Returns the ISO day of the week (1 = Monday, 7 = Sunday) for a given date or 'YYYY-MM-DD' string
 * interpreted in America/Santo_Domingo.
 */
export function getBusinessIsoDow(dateOrStr: Date | string = new Date()): number {
  if (typeof dateOrStr === "string") {
    const [year, month, day] = dateOrStr.split("-").map(Number);
    // Use noon UTC to avoid date shifting
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = d.getUTCDay();
    return dayOfWeek === 0 ? 7 : dayOfWeek;
  }

  // Get weekday name in English to map reliably
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
  }).format(dateOrStr);

  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return map[weekday] ?? 1;
}

/**
 * Checks whether a given YYYY-MM-DD date is strictly in the past relative to today's business date.
 */
export function isDatePast(dateStr: string, todayStr: string = getBusinessToday()): boolean {
  return dateStr < todayStr;
}
