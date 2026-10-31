import { formatTenantCurrency, normalizeTenantCurrencyCode } from "../../../../shared/lib/currency";
import type {
  CompanyStatementRow,
  DateRangeValidation,
  EmployeeSummaryItem,
} from "../types";

/**
 * Returns today's date in America/Santo_Domingo timezone as YYYY-MM-DD.
 */
export function getSantoDomingoToday(referenceDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(referenceDate);
}

/**
 * Returns the default statement date range in America/Santo_Domingo timezone:
 * first day of the current month -> today.
 */
export function getDefaultStatementDateRange(referenceDate: Date = new Date()): {
  from: string;
  to: string;
} {
  const today = getSantoDomingoToday(referenceDate);
  const from = `${today.slice(0, 7)}-01`;
  return { from, to: today };
}

/**
 * Calculates calendar day difference between two YYYY-MM-DD date strings.
 */
export function getDaysDifference(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const diffMs = toDate.getTime() - fromDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Validates a statement date range:
 * - Both dates required in YYYY-MM-DD format
 * - from <= to
 * - range <= 366 days
 */
export function validateStatementDateRange(
  from: string,
  to: string
): DateRangeValidation {
  if (!from || !to) {
    return { valid: false, error: "Las fechas Desde y Hasta son requeridas." };
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return {
      valid: false,
      error: "Formato de fecha inválido. Utilice el formato YYYY-MM-DD.",
    };
  }

  if (from > to) {
    return {
      valid: false,
      error: "La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.",
    };
  }

  const days = getDaysDifference(from, to);
  if (days > 366) {
    return {
      valid: false,
      error: "El rango de fechas no puede superar los 366 días.",
    };
  }

  return { valid: true };
}

/**
 * Formats a YYYY-MM-DD date string into dd/mm/yyyy.
 */
export function formatStatementDate(ymd: string): string {
  if (!ymd) return "—";
  const parts = ymd.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return ymd;
}

/**
 * Formats statement period header as: "Del dd/mm/yyyy al dd/mm/yyyy".
 */
export function formatStatementPeriod(from: string, to: string): string {
  return `Del ${formatStatementDate(from)} al ${formatStatementDate(to)}`;
}

/**
 * Formats currency amount using tenant currency code (default DOP -> RD$ 1,234.50).
 */
export function formatStatementMoney(
  amount: number,
  currencyCode?: string | null
): string {
  const code = normalizeTenantCurrencyCode(currencyCode);
  return formatTenantCurrency(Number(amount) || 0, code);
}

/**
 * Converts a company name into a URL/file safe slug.
 * Removes diacritics, converts to lowercase, and replaces non-alphanumeric chars with hyphens.
 */
export function sanitizeCompanySlug(name: string): string {
  if (!name || typeof name !== "string") return "empresa";
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "empresa";
}

/**
 * Builds the standard PDF file name:
 * estado-cuenta_<company-slug>_<from>_<to>.pdf
 */
export function buildStatementFileName(
  companyName: string,
  from: string,
  to: string
): string {
  const slug = sanitizeCompanySlug(companyName);
  return `estado-cuenta_${slug}_${from}_${to}.pdf`;
}

/**
 * Aggregates statement rows by employee name, calculating total orders and amount.
 * Sorted by totalAmount descending, then employeeName ascending.
 */
export function buildEmployeeSummary(
  rows: CompanyStatementRow[]
): EmployeeSummaryItem[] {
  const map = new Map<string, { count: number; total: number }>();

  for (const row of rows) {
    const name = row.employee_name?.trim() || "Sin empleado asignado";
    const current = map.get(name) || { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.monto_total || 0);
    map.set(name, current);
  }

  const result: EmployeeSummaryItem[] = [];
  for (const [employeeName, { count, total }] of map.entries()) {
    result.push({
      employeeName,
      orderCount: count,
      totalAmount: total,
    });
  }

  result.sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) {
      return b.totalAmount - a.totalAmount;
    }
    return a.employeeName.localeCompare(b.employeeName);
  });

  return result;
}
