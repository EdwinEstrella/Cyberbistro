/**
 * Pure date calculation helpers for recurring monthly fees and billing cycles.
 * Mirrors the PostgreSQL billing logic in cloudix_billing_date,
 * cloudix_latest_billing_date_on_or_before, and cloudix_accrue_tenant_monthly_fee.
 */

function parseDateParts(input: Date | string): { year: number; month: number; day: number } {
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10),
        day: parseInt(match[3], 10),
      };
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

function toIsoDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Returns the clamped billing date (YYYY-MM-DD) for a given month and target payment day.
 * If the month has fewer days than `day` (e.g. Feb 31 -> Feb 28/29), clamps to the month's last day.
 */
export function clampBillingDate(year: number, month: number, day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError("Billing day must be an integer between 1 and 31.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be an integer between 1 and 12.");
  }
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(Math.max(day, 1), lastDay);
  return toIsoDateString(year, month, clampedDay);
}

/**
 * Returns the latest billing date (YYYY-MM-DD) that falls on or before `asOf`.
 * If this month's billing date is <= asOf, returns this month's billing date;
 * otherwise returns the previous month's billing date.
 */
export function latestBillingDateOnOrBefore(day: number, asOf: Date | string): string {
  const { year, month, day: asOfDay } = parseDateParts(asOf);
  const asOfIso = toIsoDateString(year, month, asOfDay);
  const thisMonthBilling = clampBillingDate(year, month, day);

  if (thisMonthBilling <= asOfIso) {
    return thisMonthBilling;
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return clampBillingDate(prevYear, prevMonth, day);
}

/**
 * Returns the next billing date (YYYY-MM-DD) strictly after `afterDate`.
 * Used for UI previews ("Próximo cobro: 13 dic").
 */
export function nextBillingDateAfter(day: number, afterDate: Date | string): string {
  const { year, month, day: afterDay } = parseDateParts(afterDate);
  const afterIso = toIsoDateString(year, month, afterDay);
  const thisMonthBilling = clampBillingDate(year, month, day);

  if (thisMonthBilling > afterIso) {
    return thisMonthBilling;
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return clampBillingDate(nextYear, nextMonth, day);
}

/**
 * Returns all billing dates strictly after `afterDate` and on or before `onOrBeforeDate`.
 * Mirrors PostgreSQL accrual loop with maxIterations safety guard.
 */
export function billingDatesBetween(
  day: number,
  afterDate: Date | string,
  onOrBeforeDate: Date | string,
  maxIterations = 120
): string[] {
  const { year: aYear, month: aMonth, day: aDay } = parseDateParts(afterDate);
  const afterIso = toIsoDateString(aYear, aMonth, aDay);

  const { year: bYear, month: bMonth, day: bDay } = parseDateParts(onOrBeforeDate);
  const onOrBeforeIso = toIsoDateString(bYear, bMonth, bDay);

  if (afterIso >= onOrBeforeIso) {
    return [];
  }

  const results: string[] = [];
  let curYear = aMonth === 12 ? aYear + 1 : aYear;
  let curMonth = aMonth === 12 ? 1 : aMonth + 1;
  let iterations = 0;

  while (
    (curYear < bYear || (curYear === bYear && curMonth <= bMonth)) &&
    iterations < maxIterations
  ) {
    iterations++;
    const cycleDate = clampBillingDate(curYear, curMonth, day);
    if (cycleDate > afterIso && cycleDate <= onOrBeforeIso) {
      results.push(cycleDate);
    }
    if (curMonth === 12) {
      curMonth = 1;
      curYear++;
    } else {
      curMonth++;
    }
  }

  return results;
}

const SPANISH_MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"
];

/**
 * Formats a YYYY-MM-DD date into a Spanish short display string, e.g. "13 dic".
 */
export function formatBillingDateDisplay(dateStr: string): string {
  const { month, day } = parseDateParts(dateStr);
  const monthName = SPANISH_MONTH_SHORT[month - 1] ?? "";
  return `${day} ${monthName}`;
}
