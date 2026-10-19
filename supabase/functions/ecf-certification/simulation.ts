// DGII step 4 ("Pruebas de Simulacion e-CF"): the step-2 workbook re-issued with fresh sequences.
//
// The simulation reuses the scenarios of the test set (sheets ECF/RFCE) and rewrites, per row:
//  - ENCF: a new, never-used e-NCF per tipo (see allocateSequences), CasoPrueba = RNCEmisor + new e-NCF;
//  - FechaEmision: today in Dominican Republic time (dd-MM-yyyy);
//  - every other dated column with data (SHIFTED_DATE_COLUMNS) moves by the same number of days as
//    FechaEmision, so the relative order of the scenario (delivery after issue, payment limit, purchase
//    order before issue, item production/expiry...) is preserved. FechaVencimientoSecuencia is kept;
//  - InformacionReferencia: an NCFModificado that points to a document of the same workbook becomes
//    that document's new e-NCF, and FechaNCFModificado its new FechaEmision (today);
//  - IndicadorNotaCredito (when the row carries one) is recomputed with the DGII rule: 0 when the note
//    is issued within 30 days of the modified document, else 1;
//  - RFCE rows take the new e-NCF, CasoPrueba and FechaEmision of their E32 (the security code still
//    comes from the newly signed E32 at send time).
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
  /** FechaEmision of every document (dd-MM-yyyy). */
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

function rewriteEcfSheet(sheet: Sheet, mapping: Map<string, string>, today: number): Sheet {
  const header = sheet.rows[0] ?? [];
  const col = (name: string) => columnIndex(header, name);
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
  const shifted = header.map((raw, index) => (SHIFTED_DATE_COLUMNS.includes(baseName(raw)) ? index : -1)).filter((index) => index >= 0);
  const rows = sheet.rows.slice(1).map((source, offset) => {
    if (source.every((value) => isEmptyCell(value))) return source;
    const line = offset + 2;
    const row = [...source];
    const newEncf = mapping.get((row[encfCol] ?? "").trim())!;
    const delta = today - requireDate(row[emision], sheet.name, line, "FechaEmision");
    row[encfCol] = newEncf;
    row[caso] = `${(row[rnc] ?? "").trim()}${newEncf}`;
    row[emision] = formatDgiiDay(today);
    for (const index of shifted) {
      if (isEmptyCell(row[index])) continue;
      row[index] = formatDgiiDay(requireDate(row[index], sheet.name, line, header[index].trim()) + delta);
    }
    const reference = ncfMod >= 0 && !isEmptyCell(row[ncfMod]) ? row[ncfMod].trim() : null;
    let modifiedDay: number | null = null;
    if (reference && mapping.has(reference)) {
      // Every document of the simulation is issued today.
      row[ncfMod] = mapping.get(reference)!;
      if (fechaMod < 0) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: the FechaNCFModificado column is missing.`);
      row[fechaMod] = formatDgiiDay(today);
      modifiedDay = today;
    } else if (reference && fechaMod >= 0 && !isEmptyCell(row[fechaMod])) {
      modifiedDay = requireDate(row[fechaMod], sheet.name, line, "FechaNCFModificado");
    }
    if (indicador >= 0 && !isEmptyCell(row[indicador])) {
      if (modifiedDay === null) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: IndicadorNotaCredito needs FechaNCFModificado.`);
      row[indicador] = creditNoteIndicator(today, modifiedDay);
    }
    return row;
  });
  return { ...sheet, rows: [header, ...rows] };
}

function rewriteRfceSheet(sheet: Sheet, mapping: Map<string, string>, today: number): Sheet {
  const header = sheet.rows[0] ?? [];
  const [caso, encfCol, rnc, emision] = ["CasoPrueba", "ENCF", "RNCEmisor", "FechaEmision"].map((name) => columnIndex(header, name));
  const rows = sheet.rows.slice(1).map((source) => {
    if (source.every((value) => isEmptyCell(value))) return source;
    const row = [...source];
    const newEncf = mapping.get((row[encfCol] ?? "").trim())!;
    row[encfCol] = newEncf;
    row[caso] = `${(row[rnc] ?? "").trim()}${newEncf}`;
    if (emision >= 0) row[emision] = formatDgiiDay(today);
    return row;
  });
  return { ...sheet, rows: [header, ...rows] };
}

/**
 * Builds the simulation batch from the step-2 workbook. `issued` lists the e-NCF the tenant already
 * issued (test-set and simulation runs); `now` fixes FechaEmision. Every document keeps a pointer to
 * its source case (sourceCaseId).
 */
export function buildSimulationSet(sheets: Sheet[], options: { issued: string[]; now: Date }): SimulationSet {
  // Validates the workbook exactly like step 2 before rewriting it.
  const source = buildTestSet(sheets);
  const mapping = allocateSequences(source.ecf, options.issued);
  const today = dgiiToday(options.now);
  const rewritten = sheets.map((sheet) => {
    const name = sheet.name.trim().toUpperCase();
    if (name === "ECF") return rewriteEcfSheet(sheet, mapping, today);
    if (name === "RFCE") return rewriteRfceSheet(sheet, mapping, today);
    return sheet;
  });
  const built = buildTestSet(rewritten);
  const sourceCase = new Map<string, string>();
  for (const doc of source.ecf) sourceCase.set(mapping.get(doc.encf)!, doc.caseId);
  const withSource = <T extends { encf: string }>(doc: T) => ({ ...doc, sourceCaseId: sourceCase.get(doc.encf) ?? null });
  return { ecf: built.ecf.map(withSource), rfce: built.rfce.map(withSource), mapping, fechaEmision: formatDgiiDay(today) };
}
