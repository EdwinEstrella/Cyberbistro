/**
 * Timezone used for business operations (restaurant day cutoff, fiscal reports, etc.).
 * America/Santo_Domingo is AST (UTC-4) year-round without daylight saving changes.
 */
export const BUSINESS_TIMEZONE = "America/Santo_Domingo";

const dominicanDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Converts an ISO timestamp instant or Date into calendar date 'YYYY-MM-DD'
 * in America/Santo_Domingo (UTC-4, no DST).
 * If a plain 'YYYY-MM-DD' string without time is passed, returns it as-is.
 */
export function toDominicanLocalDate(dateOrIso: string | Date): string {
  if (typeof dateOrIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso.trim())) {
    return dateOrIso.trim();
  }
  const date = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Una fecha fiscal no es válida.");
  }
  return dominicanDateFormatter.format(date);
}
