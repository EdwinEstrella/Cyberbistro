import { crc32, deflateRawSync } from "node:zlib";

export interface ZipInput {
  name: string;
  data: string | Uint8Array;
  /** Deflate (method 8) instead of storing (method 0). */
  deflate?: boolean;
}

/** Builds a minimal ZIP archive (local headers + central directory + EOCD). */
export function makeZip(entries: ZipInput[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.from(typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : entry.data);
    const body = entry.deflate ? deflateRawSync(raw) : raw;
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, eocd]));
}

/** A fixture cell: plain string -> shared string; {n} -> number cell; {inline} -> inline string; null -> no cell. */
export type FixtureCell = string | { n: string } | { inline: string } | null;

export interface FixtureSheet {
  name: string;
  rows: FixtureCell[][];
}

export function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Builds an .xlsx workbook with shared strings, as Excel writes the DGII test set. */
export function makeXlsx(sheets: FixtureSheet[], options: { deflate?: boolean } = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = new Map<string, number>();
  const sheetXml = sheets.map((sheet) => {
    const rows = sheet.rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            if (cell === null) return "";
            const ref = `${columnLetters(c)}${r + 1}`;
            if (typeof cell === "string") {
              if (!sharedIndex.has(cell)) {
                sharedIndex.set(cell, shared.length);
                shared.push(cell);
              }
              return `<c r="${ref}" t="s"><v>${sharedIndex.get(cell)}</v></c>`;
            }
            if ("n" in cell) return `<c r="${ref}"><v>${cell.n}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell.inline)}</t></is></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    return `﻿<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}</Relationships>`;
  const sharedXml = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
    .map((value) => `<si><t xml:space="preserve">${esc(value)}</t></si>`)
    .join("")}</sst>`;
  const deflate = options.deflate ?? true;
  return makeZip([
    { name: "[Content_Types].xml", data: "<Types/>", deflate },
    { name: "xl/workbook.xml", data: workbook, deflate },
    { name: "xl/_rels/workbook.xml.rels", data: rels, deflate },
    ...sheetXml.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data, deflate })),
    { name: "xl/sharedStrings.xml", data: sharedXml, deflate },
  ]);
}
