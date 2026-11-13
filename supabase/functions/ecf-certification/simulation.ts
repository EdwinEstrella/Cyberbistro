// DGII step 4 ("Pruebas de Simulacion e-CF"): the step-2 workbook re-issued with fresh sequences.
//
// The simulation reuses the scenarios of the test set (sheets ECF/RFCE) and rewrites, per row:
//  - ENCF: a new, never-used e-NCF per tipo (see allocateSequences), CasoPrueba = RNCEmisor + new e-NCF;
//  - FechaEmision: today in Dominican Republic time (dd-MM-yyyy) EXCEPT for documents carrying additional-tax
//    rates (non-empty TasaImpuestoAdicional, indexed variants included), which KEEP their original workbook
//    FechaEmision. Why: DGII validates additional-tax rates against the issue date (specific rates are re-indexed
//    yearly, so a historical rate such as 2020 on a 2026 date fails with DGII error 11064);
//  - every other dated column with data (SHIFTED_DATE_COLUMNS) moves by the same number of days as
//    FechaEmision (delta = 0 for rate-carrying rows), so the relative order of the scenario (delivery
//    after issue, payment limit, purchase order before issue, item production/expiry...) is preserved.
//    FechaVencimientoSecuencia is kept;
//  - InformacionReferencia: an NCFModificado that points to a document of the same workbook becomes
//    that document's new e-NCF, and FechaNCFModificado that document's actual emission date from the map;
//  - IndicadorNotaCredito (when the row carries one) is recomputed with the DGII rule: 0 when the note
//    is issued within 30 days of the modified document (noteDay - modifiedDay <= 30), else 1;
//  - RFCE rows take the new e-NCF, CasoPrueba and FechaEmision of their matching E32 from the map (the
//    security code still comes from the newly signed E32 at send time).
// The rewritten sheets are then built by the regular test-set builder, so every other rule applies.
import { buildTestSet, isEmptyCell, TestSetError, type TestSet } from "./builder.ts";
import type { Sheet } from "./xlsx.ts";

/** Highest sequence a DGII e-NCF can carry (E + tipo + 10 digits). */
const MAX_SEQUENCE = 9_999_999_999;
const DAY_MS = 86_400_000;
const NOTE_WINDOW_DAYS = 30;

/** Dated columns shifted with FechaEmision (item-level ones match any [n] index). */
export const SHIFTED_DATE_COLUMNS = [
  "FechaLimitePago",
  "FechaDesde",
  "FechaHasta",
  "FechaEntrega",
  "FechaOrdenCompra",
  "FechaEmbarque",
  "FechaElaboracion",
  "FechaVencimientoItem",
];

const ENCF = /^E(\d{2})(\d{10})$/;

/** Highest issued sequence per tipo, from e-NCF the tenant already issued. */
export function maxSequencesByTipo(issued: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const encf of issued) {
    const match = ENCF.exec(encf);
    if (!match) continue;
    const sequence = Number(match[2]);
    if (sequence > (out.get(match[1]) ?? 0)) out.set(match[1], sequence);
  }
  return out;
}

export function formatEncf(tipo: string, sequence: number): string {
  if (!/^\d{2}$/.test(tipo)) throw new TestSetError(`Invalid e-CF type ${tipo}.`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new TestSetError(`No e-NCF sequence left for type E${tipo}.`);
  }
  return `E${tipo}${String(sequence).padStart(10, "0")}`;
}

/**
 * New e-NCF for each document, in order: per tipo, highest issued sequence + 1, + 2... Independent
 * per tipo. `issued` must hold every e-NCF the tenant issued in test-set and simulation runs (never
 * commercial approvals, whose e-NCF belong to the DGII emitter).
 */
export function allocateSequences(docs: { encf: string; tipoEcf: string }[], issued: string[]): Map<string, string> {
  const next = maxSequencesByTipo(issued);
  const out = new Map<string, string>();
  for (const doc of docs) {
    if (out.has(doc.encf)) continue;
    const sequence = (next.get(doc.tipoEcf) ?? 0) + 1;
    next.set(doc.tipoEcf, sequence);
    out.set(doc.encf, formatEncf(doc.tipoEcf, sequence));
  }
  return out;
}

/** dd-MM-yyyy -> UTC day number; null when not a valid date. */
export function parseDgiiDate(value: string): number | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.round(time / DAY_MS);
}

export function formatDgiiDay(dayNumber: number): string {
  const date = new Date(dayNumber * DAY_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}

/** Today's day number in Dominican Republic time (UTC-4, no daylight saving). */
export function dgiiToday(now: Date): number {
  return Math.floor((now.getTime() - 4 * 3600 * 1000) / DAY_MS);
}

/** DGII rule for IndicadorNotaCredito: 0 within 30 days of the modified document, else 1. */
export function creditNoteIndicator(noteDay: number, modifiedDay: number): "0" | "1" {
  return noteDay - modifiedDay <= NOTE_WINDOW_DAYS ? "0" : "1";
}

export interface SimulationSet extends TestSet {
  /** Source e-NCF -> new e-NCF. */
  mapping: Map<string, string>;
  /** Default simulation FechaEmision (dd-MM-yyyy, Dominican Republic today). Note: documents carrying additional-tax rates keep their original FechaEmision. */
  fechaEmision: string;
}

const baseName = (raw: string) => (raw ?? "").trim().replace(/(\[\d+\])+$/, "");

function columnIndex(header: string[], name: string): number {
  return header.findIndex((raw) => (raw ?? "").trim() === name);
}

function requireDate(value: string | undefined, sheet: string, line: number, column: string): number {
  const day = isEmptyCell(value) ? null : parseDgiiDate(value!);
  if (day === null) throw new TestSetError(`Sheet ${sheet}, row ${line}: ${column} is missing or is not a dd-MM-yyyy date.`);
  return day;
}

/** Issuer data the simulation XMLs carry instead of the DGII workbook placeholders. */
export interface SimulationEmisor {
  razonSocial: string;
}

/** Column indexes holding the issuer legal name (RazonSocialEmisor) and trade name (NombreComercial), when present. */
function emisorColumns(header: string[], emisor: SimulationEmisor | undefined): number[] {
  if (!emisor?.razonSocial.trim()) return [];
  return ["RazonSocialEmisor", "NombreComercial"].map((name) => columnIndex(header, name)).filter((index) => index >= 0);
}

/**
 * Per-document emission day in DR time: rows carrying an additional-tax rate
 * (non-empty TasaImpuestoAdicional, indexed variants included) keep their original FechaEmision
 * because DGII validates rates against issue date; all other rows are issued today.
 */
export function computeEmissionDays(ecfSheet: Sheet, today: number): Map<string, number> {
  const header = ecfSheet.rows[0] ?? [];
  const encfCol = columnIndex(header, "ENCF");
  const emisionCol = columnIndex(header, "FechaEmision");
  if (emisionCol < 0) throw new TestSetError(`Sheet ${ecfSheet.name}: the FechaEmision column is missing.`);
  if (encfCol < 0) throw new TestSetError(`Sheet ${ecfSheet.name}: the ENCF column is missing.`);

  const rateCols = header
    .map((raw, index) => (baseName(raw) === "TasaImpuestoAdicional" ? index : -1))
    .filter((index) => index >= 0);

  const out = new Map<string, number>();
  ecfSheet.rows.slice(1).forEach((row, offset) => {
    if (row.every((value) => isEmptyCell(value))) return;
    const line = offset + 2;
    const encf = (row[encfCol] ?? "").trim();
    if (!encf) throw new TestSetError(`Sheet ${ecfSheet.name}, row ${line}: ENCF is missing.`);
    const originalDay = requireDate(row[emisionCol], ecfSheet.name, line, "FechaEmision");
    const carriesRate = rateCols.some((index) => !isEmptyCell(row[index]));
    out.set(encf, carriesRate ? originalDay : today);
  });
  return out;
}

function rewriteEcfSheet(
  sheet: Sheet,
  mapping: Map<string, string>,
  emissionDays: Map<string, number>,
  today: number,
  emisor?: SimulationEmisor,
): Sheet {
  const header = sheet.rows[0] ?? [];
  const col = (name: string) => columnIndex(header, name);
  const emisorCols = emisorColumns(header, emisor);
  const [caso, encfCol, rnc, emision, ncfMod, fechaMod, indicador] = [
    col("CasoPrueba"),
    col("ENCF"),
    col("RNCEmisor"),
    col("FechaEmision"),
    col("NCFModificado"),
    col("FechaNCFModificado"),
    col("IndicadorNotaCredito"),
  ];
  if (emision < 0) throw new TestSetError(`Sheet ${sheet.name}: the FechaEmision column is missing.`);
  if (encfCol < 0) throw new TestSetError(`Sheet ${sheet.name}: the ENCF column is missing.`);
  const shifted = header.map((raw, index) => (SHIFTED_DATE_COLUMNS.includes(baseName(raw)) ? index : -1)).filter((index) => index >= 0);
  const rows = sheet.rows.slice(1).map((source, offset) => {
    if (source.every((value) => isEmptyCell(value))) return source;
    const line = offset + 2;
    const row = [...source];
    const sourceEncf = (row[encfCol] ?? "").trim();
    const newEncf = mapping.get(sourceEncf)!;
    const originalDay = requireDate(row[emision], sheet.name, line, "FechaEmision");
    const docDay = emissionDays.get(sourceEncf) ?? today;
    const delta = docDay - originalDay;
    row[encfCol] = newEncf;
    row[caso] = `${(row[rnc] ?? "").trim()}${newEncf}`;
    row[emision] = formatDgiiDay(docDay);
    for (const index of emisorCols) row[index] = emisor!.razonSocial.trim();
    for (const index of shifted) {
      if (isEmptyCell(row[index])) continue;
      row[index] = formatDgiiDay(requireDate(row[index], sheet.name, line, header[index].trim()) + delta);
    }
    const reference = ncfMod >= 0 && !isEmptyCell(row[ncfMod]) ? row[ncfMod].trim() : null;
    let modifiedDay: number | null = null;
    if (reference && mapping.has(reference)) {
      row[ncfMod] = mapping.get(reference)!;
      if (fechaMod < 0) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: the FechaNCFModificado column is missing.`);
      const refDay = emissionDays.get(reference);
      if (refDay === undefined) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: referenced document ${reference} has no emission day.`);
      row[fechaMod] = formatDgiiDay(refDay);
      modifiedDay = refDay;
    } else if (reference && fechaMod >= 0 && !isEmptyCell(row[fechaMod])) {
      modifiedDay = requireDate(row[fechaMod], sheet.name, line, "FechaNCFModificado");
    }
    if (indicador >= 0 && !isEmptyCell(row[indicador])) {
      if (modifiedDay === null) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: IndicadorNotaCredito needs FechaNCFModificado.`);
      row[indicador] = creditNoteIndicator(docDay, modifiedDay);
    }
    return row;
  });
  return { ...sheet, rows: [header, ...rows] };
}

function rewriteRfceSheet(
  sheet: Sheet,
  mapping: Map<string, string>,
  emissionDays: Map<string, number>,
  today: number,
  emisor?: SimulationEmisor,
): Sheet {
  const header = sheet.rows[0] ?? [];
  const emisorCols = emisorColumns(header, emisor);
  const [caso, encfCol, rnc, emision] = ["CasoPrueba", "ENCF", "RNCEmisor", "FechaEmision"].map((name) => columnIndex(header, name));
  const rows = sheet.rows.slice(1).map((source) => {
    if (source.every((value) => isEmptyCell(value))) return source;
    const row = [...source];
    const sourceEncf = (row[encfCol] ?? "").trim();
    const newEncf = mapping.get(sourceEncf)!;
    row[encfCol] = newEncf;
    row[caso] = `${(row[rnc] ?? "").trim()}${newEncf}`;
    if (emision >= 0) {
      const docDay = emissionDays.get(sourceEncf) ?? today;
      row[emision] = formatDgiiDay(docDay);
    }
    for (const index of emisorCols) row[index] = emisor!.razonSocial.trim();
    return row;
  });
  return { ...sheet, rows: [header, ...rows] };
}

/**
 * Builds the simulation batch from the step-2 workbook. `issued` lists the e-NCF the tenant already
 * issued (test-set and simulation runs); `now` fixes FechaEmision. Every document keeps a pointer to
 * its source case (sourceCaseId). With `emisor`, every document carries the tenant legal name instead of
 * the workbook placeholder.
 */
export function buildSimulationSet(sheets: Sheet[], options: { issued: string[]; now: Date; emisor?: SimulationEmisor }): SimulationSet {
  // Validates the workbook exactly like step 2 before rewriting it.
  const source = buildTestSet(sheets);
  const mapping = allocateSequences(source.ecf, options.issued);
  const today = dgiiToday(options.now);
  const ecfSheet = sheets.find((sheet) => sheet.name.trim().toUpperCase() === "ECF");
  const emissionDays = ecfSheet ? computeEmissionDays(ecfSheet, today) : new Map<string, number>();
  const rewritten = sheets.map((sheet) => {
    const name = sheet.name.trim().toUpperCase();
    if (name === "ECF") return rewriteEcfSheet(sheet, mapping, emissionDays, today, options.emisor);
    if (name === "RFCE") return rewriteRfceSheet(sheet, mapping, emissionDays, today, options.emisor);
    return sheet;
  });
  const built = buildTestSet(rewritten);
  const sourceCase = new Map<string, string>();
  for (const doc of source.ecf) sourceCase.set(mapping.get(doc.encf)!, doc.caseId);
  const withSource = <T extends { encf: string }>(doc: T) => ({ ...doc, sourceCaseId: sourceCase.get(doc.encf) ?? null });
  return { ecf: built.ecf.map(withSource), rfce: built.rfce.map(withSource), mapping, fechaEmision: formatDgiiDay(today) };
}
