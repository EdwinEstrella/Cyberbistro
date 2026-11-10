import { BUSINESS_TIMEZONE, toDominicanLocalDate } from "../../../shared/lib/businessDate";
import { downloadTextFile } from "../../../shared/lib/downloadTextFile";
import { generateFormato607 } from "./formato607";
import { loadFormato607Data, type Formato607DataResult } from "./formato607Data";

export interface MonthOption {
  value: string;
  label: string;
}

function currentDominicanYearMonth(now: Date = new Date()): { year: number; month: number } {
  const localDate = toDominicanLocalDate(now);
  return {
    year: parseInt(localDate.slice(0, 4), 10),
    month: parseInt(localDate.slice(5, 7), 10),
  };
}

/**
 * Returns the previous month in 'YYYY-MM' format based on the Dominican calendar date (America/Santo_Domingo, UTC-4).
 */
export function previousMonthValue(now: Date = new Date()): string {
  const { year, month } = currentDominicanYearMonth(now);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;

  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

/**
 * Generates 24 month options starting from the current Dominican calendar month backwards.
 */
export function buildMonthOptions(now: Date = new Date()): MonthOption[] {
  const { year: curYear, month: curMonth } = currentDominicanYearMonth(now);

  const formatter = new Intl.DateTimeFormat("es-DO", {
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TIMEZONE,
  });

  return Array.from({ length: 24 }, (_, index) => {
    const totalMonths = curYear * 12 + (curMonth - 1) - index;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    const date = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
    return { value, label: formatter.format(date) };
  });
}

/**
 * Orchestrates loading data, formatting, downloading file, and returning the export summary.
 */
export async function executeFormato607Export(
  tenantId: string | null | undefined,
  selectedMonth: string,
  format: "txt" | "csv",
  deps: {
    loadData?: typeof loadFormato607Data;
    generate?: typeof generateFormato607;
    download?: typeof downloadTextFile;
  } = {}
): Promise<{ successMessage: string; dataResult: Formato607DataResult }> {
  if (!tenantId) {
    throw new Error("No hay un negocio activo seleccionado.");
  }

  const period = selectedMonth.replace("-", "");
  if (!/^\d{6}$/.test(period)) {
    throw new Error("Seleccioná un mes válido para exportar.");
  }

  const load = deps.loadData ?? loadFormato607Data;
  const generate = deps.generate ?? generateFormato607;
  const download = deps.download ?? downloadTextFile;

  const dataResult = await load(tenantId, period);
  const text = generate(
    dataResult.emitterRnc,
    period,
    dataResult.rows,
    format
  );

  const mimeType =
    format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
  download(`DGII-607-${period}.${format}`, text, mimeType);

  const successMessage = `Formato 607 generado con ${dataResult.rows.length} comprobante(s).`;
  return { successMessage, dataResult };
}
