// Minimal, dependency-free .xlsx reader (Deno edge runtime and vitest): ZIP central directory +
// DecompressionStream("deflate-raw"), workbook/rels for sheet names, shared and inline strings.
// Cell text is returned exactly as stored (numbers are never reformatted); empty cells are "".
// Formulas, styles and dates are not interpreted: the DGII test set stores every value as text.

export interface Sheet {
  name: string;
  /** Dense rows (row 1 first); each row is padded with "" up to its last stored cell. */
  rows: string[][];
}

export interface XlsxLimits {
  maxBytes: number;
  maxSheets: number;
  maxRows: number;
  maxColumns: number;
  /** Per decompressed entry. */
  maxEntryBytes: number;
  /** Sum of all decompressed entries read. */
  maxTotalBytes: number;
}

export const DEFAULT_XLSX_LIMITS: XlsxLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxSheets: 20,
  maxRows: 2000,
  maxColumns: 16384,
  maxEntryBytes: 40 * 1024 * 1024,
  maxTotalBytes: 80 * 1024 * 1024,
};

export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxError";
  }
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readCentralDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const minEocd = 22;
  if (bytes.length < minEocd) throw new XlsxError("The file is not a valid .xlsx (zip) file.");
  let eocd = -1;
  for (let i = bytes.length - minEocd; i >= Math.max(0, bytes.length - minEocd - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("The file is not a valid .xlsx (zip) file.");
  const count = u16(bytes, eocd + 10);
  const size = u32(bytes, eocd + 12);
  const start = u32(bytes, eocd + 16);
  if (start === 0xffffffff || count === 0xffff) throw new XlsxError("ZIP64 files are not supported.");
  if (start + size > bytes.length) throw new XlsxError("The .xlsx file is truncated.");

  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  let offset = start;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || u32(bytes, offset) !== 0x02014b50) throw new XlsxError("The .xlsx file is corrupt.");
    const flags = u16(bytes, offset + 8);
    const method = u16(bytes, offset + 10);
    const compressedSize = u32(bytes, offset + 20);
    const uncompressedSize = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (flags & 0x1) throw new XlsxError("Encrypted .xlsx files are not supported.");
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array, cap: number): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new XlsxError("The .xlsx file expands beyond the allowed size.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

class ZipReader {
  private total = 0;
  constructor(private readonly bytes: Uint8Array, private readonly entries: Map<string, ZipEntry>, private readonly limits: XlsxLimits) {}

  has(name: string): boolean {
    return this.entries.has(name);
  }

  async text(name: string): Promise<string> {
    const entry = this.entries.get(name);
    if (!entry) throw new XlsxError(`The .xlsx file has no ${name}.`);
    const { bytes } = this;
    const local = entry.localOffset;
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) throw new XlsxError("The .xlsx file is corrupt.");
    const dataStart = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.subarray(dataStart, dataStart + entry.compressedSize);
    if (data.length !== entry.compressedSize) throw new XlsxError("The .xlsx file is truncated.");
    const cap = Math.min(this.limits.maxEntryBytes, this.limits.maxTotalBytes - this.total);
    let raw: Uint8Array;
    if (entry.method === 0) raw = data;
    else if (entry.method === 8) raw = await inflateRaw(data, cap);
    else throw new XlsxError("The .xlsx file uses an unsupported compression method.");
    if (raw.length > cap) throw new XlsxError("The .xlsx file expands beyond the allowed size.");
    this.total += raw.length;
    return new TextDecoder().decode(raw).replace(/^﻿/, "");
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

function attributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1]] = decodeXmlText(match[2] ?? match[3] ?? "");
  }
  return out;
}

// Optional namespace prefix on SpreadsheetML elements (some writers emit `x:c`, `x:t`).
const P = "(?:[A-Za-z_][\\w.-]*:)?";

/** Concatenated text of the <t> runs of an <si>/<is>, without phonetic (<rPh>) runs. */
function richText(source: string): string {
  const withoutPhonetic = source.replace(new RegExp(`<${P}rPh\\b[\\s\\S]*?<\\/${P}rPh>`, "g"), "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(new RegExp(`<${P}t\\b[^>]*?(?:\\/>|>([\\s\\S]*?)<\\/${P}t>)`, "g"))) {
    text += decodeXmlText(match[1] ?? "");
  }
  return text;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const match of xml.matchAll(new RegExp(`<${P}si\\b[^>]*?(?:\\/>|>([\\s\\S]*?)<\\/${P}si>)`, "g"))) {
    out.push(richText(match[1] ?? ""));
  }
  return out;
}

/** Zero-based column index of a cell reference ("A1" -> 0, "AA7" -> 26); -1 when absent. */
export function columnIndex(ref: string | undefined): number {
  const letters = ref?.match(/^([A-Za-z]{1,3})\d*$/)?.[1];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[], limits: XlsxLimits): string[][] {
  const rows: string[][] = [];
  const rowPattern = new RegExp(`<${P}row\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${P}row>)`, "g");
  const cellPattern = new RegExp(`<${P}c\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${P}c>)`, "g");
  const valuePattern = new RegExp(`<${P}v\\b[^>]*?(?:\\/>|>([\\s\\S]*?)<\\/${P}v>)`);
  const inlinePattern = new RegExp(`<${P}is\\b[^>]*>([\\s\\S]*?)<\\/${P}is>`);
  let nextRow = 0;
  for (const rowMatch of xml.matchAll(rowPattern)) {
    const rowAttrs = attributes(rowMatch[1]);
    const rowNumber = rowAttrs.r ? Number(rowAttrs.r) - 1 : nextRow;
    if (!Number.isInteger(rowNumber) || rowNumber < 0) throw new XlsxError("The .xlsx file has an invalid row reference.");
    if (rowNumber >= limits.maxRows) throw new XlsxError(`The sheet has more than ${limits.maxRows} rows.`);
    nextRow = rowNumber + 1;
    const row: string[] = [];
    let nextColumn = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(cellPattern)) {
      const cellAttrs = attributes(cellMatch[1]);
      const ref = cellAttrs.r?.match(/^[A-Za-z]+/)?.[0];
      const column = ref ? columnIndex(ref) : nextColumn;
      if (column < 0) throw new XlsxError("The .xlsx file has an invalid cell reference.");
      if (column >= limits.maxColumns) throw new XlsxError(`The sheet has more than ${limits.maxColumns} columns.`);
      nextColumn = column + 1;
      const body = cellMatch[2] ?? "";
      let value = "";
      if (cellAttrs.t === "inlineStr") {
        value = richText(body.match(inlinePattern)?.[1] ?? "");
      } else {
        const raw = body.match(valuePattern)?.[1];
        if (raw !== undefined) {
          const text = decodeXmlText(raw);
          if (cellAttrs.t === "s") {
            const index = Number(text);
            if (!Number.isInteger(index) || index < 0 || index >= shared.length) throw new XlsxError("The .xlsx file references a missing shared string.");
            value = shared[index];
          } else {
            value = text;
          }
        }
      }
      while (row.length < column) row.push("");
      row[column] = value;
    }
    while (rows.length < rowNumber) rows.push([]);
    rows[rowNumber] = row;
  }
  return rows;
}

function resolveTarget(target: string): string {
  const clean = target.replace(/\\/g, "/");
  if (clean.startsWith("/")) return clean.slice(1);
  const parts = `xl/${clean}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

export async function readXlsx(bytes: Uint8Array, limits: XlsxLimits = DEFAULT_XLSX_LIMITS): Promise<Sheet[]> {
  if (bytes.length > limits.maxBytes) throw new XlsxError("The .xlsx file is too large.");
  const zip = new ZipReader(bytes, readCentralDirectory(bytes), limits);
  const workbook = await zip.text("xl/workbook.xml");
  const rels = zip.has("xl/_rels/workbook.xml.rels") ? await zip.text("xl/_rels/workbook.xml.rels") : "";
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*?)\/?>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.Id && attrs.Target) targets.set(attrs.Id, resolveTarget(attrs.Target));
  }
  const shared = zip.has("xl/sharedStrings.xml") ? parseSharedStrings(await zip.text("xl/sharedStrings.xml")) : [];

  const declared = [...workbook.matchAll(new RegExp(`<${P}sheet\\b([^>]*?)\\/?>`, "g"))].map((match) => attributes(match[1]));
  if (declared.length === 0) throw new XlsxError("The .xlsx file has no sheets.");
  if (declared.length > limits.maxSheets) throw new XlsxError(`The .xlsx file has more than ${limits.maxSheets} sheets.`);
  const sheets: Sheet[] = [];
  for (const [index, attrs] of declared.entries()) {
    const relId = attrs["r:id"] ?? Object.entries(attrs).find(([key]) => key.endsWith(":id"))?.[1];
    const path = (relId && targets.get(relId)) ?? `xl/worksheets/sheet${index + 1}.xml`;
    if (!zip.has(path)) throw new XlsxError(`The .xlsx file is missing the sheet ${attrs.name ?? index + 1}.`);
    sheets.push({ name: attrs.name ?? `Sheet${index + 1}`, rows: parseSheet(await zip.text(path), shared, limits) });
  }
  return sheets;
}
