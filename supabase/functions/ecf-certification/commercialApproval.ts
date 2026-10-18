// Builds ACECF (commercial approval) XML from the DGII "Aprobaciones Comerciales" workbook.
// Sheet ACEECF_Generadas, one ACECF per row. Element order follows modulo-ecf IACECF.ts:
// DetalleAprobacionComercial = Version, RNCEmisor, eNCF, FechaEmision, MontoTotal, RNCComprador,
// Estado, DetalleMotivoRechazo (only when rejecting), FechaHoraAprobacionComercial.
// Unlike the library helper, the approval time is not hardcoded: the sheet value is kept when valid,
// otherwise the current Dominican Republic time is used.
import { TestSetError, escapeXml, formatDgiiDateTime, isEmptyCell } from "./builder.ts";
import type { Sheet } from "./xlsx.ts";

export type WorkbookType = "test_set" | "commercial_approval";

export const ACECF_SHEET = "ACEECF_GENERADAS";

export interface BuiltApproval {
  /** RNCComprador + eNCF: also the DGII file name (without .xml). */
  caseId: string;
  encf: string;
  tipoEcf: string;
  rncEmisor: string;
  rncComprador: string;
  /** "1" approved, "2" rejected. */
  estado: "1" | "2";
  /** Unsigned XML (root ACECF). */
  xml: string;
}

const normalizeName = (name: string) => name.trim().toUpperCase();

/** Test-set sheets (ECF/RFCE) and the ACECF sheet never mix in one workbook. */
export function detectWorkbookType(sheets: Sheet[]): WorkbookType {
  const names = sheets.map((sheet) => normalizeName(sheet.name));
  const testSet = names.includes("ECF") || names.includes("RFCE");
  const approval = names.includes(ACECF_SHEET);
  if (testSet && approval) {
    throw new TestSetError("The workbook mixes test-set sheets (ECF/RFCE) with the commercial approval sheet (ACEECF_Generadas).");
  }
  if (approval) return "commercial_approval";
  if (testSet) return "test_set";
  throw new TestSetError("The workbook has no ECF sheet and no ACEECF_Generadas sheet.");
}

const COLUMNS = [
  "Version",
  "RNCEmisor",
  "eNCF",
  "FechaEmision",
  "MontoTotal",
  "RNCComprador",
  "Estado",
  "DetalleMotivoRechazo",
  "FechaHoraAprobacionComercial",
] as const;
const REQUIRED = ["RNCEmisor", "eNCF", "FechaEmision", "MontoTotal", "RNCComprador", "Estado"] as const;
const DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
const DATE_TIME = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

function validDate(day: number, month: number, year: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** True for a real dd-MM-yyyy HH:mm:ss timestamp. */
export function isDgiiDateTime(value: string): boolean {
  const match = value.match(DATE_TIME);
  if (!match) return false;
  const [day, month, year, hour, minute, second] = match.slice(1).map(Number);
  return validDate(day, month, year) && hour < 24 && minute < 60 && second < 60;
}

function isDgiiDate(value: string): boolean {
  const match = value.match(DATE);
  return !!match && validDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function buildCommercialApprovals(sheets: Sheet[], now: Date): BuiltApproval[] {
  const sheet = sheets.find((item) => normalizeName(item.name) === ACECF_SHEET);
  if (!sheet) throw new TestSetError("The workbook has no ACEECF_Generadas sheet.");
  const header = (sheet.rows[0] ?? []).map((name) => (name ?? "").trim());
  const index = new Map<string, number>();
  header.forEach((name, column) => {
    const known = COLUMNS.find((candidate) => candidate.toUpperCase() === name.toUpperCase());
    if (!known) return;
    if (index.has(known)) throw new TestSetError(`Sheet ${sheet.name}: duplicated column ${known}.`);
    index.set(known, column);
  });
  for (const name of REQUIRED) {
    if (!index.has(name)) throw new TestSetError(`Sheet ${sheet.name}: the ${name} column is missing.`);
  }
  const known = new Set(index.values());

  const out: BuiltApproval[] = [];
  const seen = new Set<string>();
  sheet.rows.slice(1).forEach((row, offset) => {
    if (row.every((value) => isEmptyCell(value))) return;
    const line = offset + 2;
    const fail = (message: string): never => {
      throw new TestSetError(`Sheet ${sheet.name}, row ${line}: ${message}`);
    };
    row.forEach((value, column) => {
      if (!known.has(column) && !isEmptyCell(value)) fail(`column ${header[column] || column + 1} is not supported but has a value.`);
    });
    const get = (name: (typeof COLUMNS)[number]) => {
      const column = index.get(name);
      const value = column === undefined ? undefined : row[column];
      return isEmptyCell(value) ? "" : value!.trim();
    };

    const version = get("Version") || "1.0";
    const rncEmisor = get("RNCEmisor");
    const encf = get("eNCF");
    const fechaEmision = get("FechaEmision");
    const montoTotal = get("MontoTotal");
    const rncComprador = get("RNCComprador");
    const estado = get("Estado");
    const motivo = get("DetalleMotivoRechazo");
    const sheetTime = get("FechaHoraAprobacionComercial");

    if (!/^\d+(\.\d+)?$/.test(version)) fail("Version is invalid.");
    if (!/^\d{9}(\d{2})?$/.test(rncEmisor)) fail("RNCEmisor is missing or invalid.");
    if (!/^\d{9}(\d{2})?$/.test(rncComprador)) fail("RNCComprador is missing or invalid.");
    if (!/^E\d{12}$/.test(encf)) fail("eNCF is missing or invalid.");
    if (!isDgiiDate(fechaEmision)) fail("FechaEmision must be a valid dd-MM-yyyy date.");
    if (!/^\d+(\.\d{1,2})?$/.test(montoTotal)) fail("MontoTotal is missing or invalid.");
    if (estado !== "1" && estado !== "2") fail("Estado must be 1 (approved) or 2 (rejected).");
    if (estado === "2" && !motivo) fail("DetalleMotivoRechazo is required when Estado is 2.");
    if (estado === "1" && motivo) fail("DetalleMotivoRechazo is only allowed when Estado is 2.");

    const caseId = `${rncComprador}${encf}`;
    if (seen.has(caseId)) throw new TestSetError(`Sheet ${sheet.name}: eNCF ${encf} appears more than once for the same buyer.`);
    seen.add(caseId);

    const approvedAt = sheetTime && isDgiiDateTime(sheetTime) ? sheetTime : formatDgiiDateTime(now);
    const tag = (name: string, value: string) => `<${name}>${escapeXml(value)}</${name}>`;
    const detail =
      tag("Version", version) +
      tag("RNCEmisor", rncEmisor) +
      tag("eNCF", encf) +
      tag("FechaEmision", fechaEmision) +
      tag("MontoTotal", montoTotal) +
      tag("RNCComprador", rncComprador) +
      tag("Estado", estado) +
      (motivo ? tag("DetalleMotivoRechazo", motivo) : "") +
      tag("FechaHoraAprobacionComercial", approvedAt);
    out.push({
      caseId,
      encf,
      tipoEcf: encf.slice(1, 3),
      rncEmisor,
      rncComprador,
      estado: estado as "1" | "2",
      xml: `<?xml version="1.0" encoding="utf-8"?><ACECF><DetalleAprobacionComercial>${detail}</DetalleAprobacionComercial></ACECF>`,
    });
  });
  if (out.length === 0) throw new TestSetError("The ACEECF_Generadas sheet has no rows.");
  return out;
}
