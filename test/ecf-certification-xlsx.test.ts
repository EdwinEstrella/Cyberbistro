import { describe, expect, it } from "vitest";
import { DEFAULT_XLSX_LIMITS, XlsxError, columnIndex, decodeXmlText, readXlsx } from "../supabase/functions/ecf-certification/xlsx";
import { columnLetters, makeXlsx, makeZip } from "./helpers/xlsxFixture";

describe("xlsx reader", () => {
  it.each([true, false])("reads shared, inline and numeric cells exactly as stored (deflate=%s)", async (deflate) => {
    const bytes = makeXlsx(
      [
        {
          name: "ECF",
          rows: [
            ["CasoPrueba", "MontoTotal", "Nota"],
            ["133488485E310000000001", "55000.00", { inline: "A & B <c>" }],
            [null, { n: "0.10" }, "#e"],
          ],
        },
        { name: "RFCE", rows: [["CasoPrueba"], ["x"]] },
      ],
      { deflate },
    );
    const sheets = await readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(["ECF", "RFCE"]);
    expect(sheets[0].rows).toEqual([
      ["CasoPrueba", "MontoTotal", "Nota"],
      ["133488485E310000000001", "55000.00", "A & B <c>"],
      ["", "0.10", "#e"],
    ]);
    expect(sheets[1].rows).toEqual([["CasoPrueba"], ["x"]]);
  });

  it("places cells by reference beyond column Z and fills gaps with empty strings", async () => {
    const row: (string | null)[] = Array.from({ length: 705 }, () => null);
    row[0] = "first";
    row[27] = "AB";
    row[704] = "AAC";
    const sheets = await readXlsx(makeXlsx([{ name: "S", rows: [row] }]));
    const [parsed] = sheets[0].rows;
    expect(parsed).toHaveLength(705);
    expect(parsed[0]).toBe("first");
    expect(parsed[1]).toBe("");
    expect(parsed[27]).toBe("AB");
    expect(parsed[704]).toBe("AAC");
    expect(columnLetters(704)).toBe("AAC");
    expect(columnIndex("AAC")).toBe(704);
    expect(columnIndex("A")).toBe(0);
    expect(columnIndex("Z")).toBe(25);
    expect(columnIndex("AA")).toBe(26);
  });

  it("keeps empty rows in place", async () => {
    const sheets = await readXlsx(makeXlsx([{ name: "S", rows: [["h"], [], ["v"]] }]));
    expect(sheets[0].rows).toEqual([["h"], [], ["v"]]);
  });

  it("concatenates rich text runs and skips phonetic runs", async () => {
    const workbook =
      '<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const rels = '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/data.xml"/></Relationships>';
    const sst = '<sst><si><r><t>Hola </t></r><r><rPr/><t>mundo</t></r><rPh><t>X</t></rPh></si><si><t/></si></sst>';
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="b"><v>1</v></c></row></sheetData></worksheet>';
    const zip = makeZip([
      { name: "xl/workbook.xml", data: workbook },
      { name: "xl/_rels/workbook.xml.rels", data: rels },
      { name: "xl/sharedStrings.xml", data: sst, deflate: true },
      { name: "xl/worksheets/data.xml", data: sheet },
    ]);
    const [parsed] = await readXlsx(zip);
    expect(parsed.rows).toEqual([["Hola mundo", "", "1"]]);
  });

  it("decodes XML entities", () => {
    expect(decodeXmlText("a&amp;b&lt;c&gt;&quot;&apos;&#65;&#x42;&unknown;")).toBe("a&b<c>\"'AB&unknown;");
  });

  it("rejects non-zip, oversized and encrypted input", async () => {
    await expect(readXlsx(new TextEncoder().encode("not a zip at all, definitely not"))).rejects.toBeInstanceOf(XlsxError);
    await expect(readXlsx(new Uint8Array(10))).rejects.toBeInstanceOf(XlsxError);
    const big = makeXlsx([{ name: "S", rows: [["x"]] }]);
    await expect(readXlsx(big, { ...DEFAULT_XLSX_LIMITS, maxBytes: big.length - 1 })).rejects.toThrow(/too large/);
    const encrypted = makeZip([{ name: "xl/workbook.xml", data: "<workbook/>" }]);
    const view = new DataView(encrypted.buffer);
    const central = encrypted.length - 22 - 46 - "xl/workbook.xml".length;
    view.setUint16(central + 8, 1, true);
    await expect(readXlsx(encrypted)).rejects.toThrow(/Encrypted/);
  });

  it("guards rows, columns, sheets and decompressed size", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => [`r${i}`]);
    await expect(readXlsx(makeXlsx([{ name: "S", rows }]), { ...DEFAULT_XLSX_LIMITS, maxRows: 5 })).rejects.toThrow(/rows/);
    await expect(readXlsx(makeXlsx([{ name: "S", rows: [["a", "b", "c"]] }]), { ...DEFAULT_XLSX_LIMITS, maxColumns: 2 })).rejects.toThrow(/columns/);
    const many = Array.from({ length: 3 }, (_, i) => ({ name: `S${i}`, rows: [["x"]] }));
    await expect(readXlsx(makeXlsx(many), { ...DEFAULT_XLSX_LIMITS, maxSheets: 2 })).rejects.toThrow(/sheets/);
    const bomb = makeXlsx([{ name: "S", rows: [["x".repeat(50_000)]] }]);
    await expect(readXlsx(bomb, { ...DEFAULT_XLSX_LIMITS, maxEntryBytes: 10_000 })).rejects.toThrow(/expands/);
  });

  it("fails on missing workbook parts and bad shared string indexes", async () => {
    await expect(readXlsx(makeZip([{ name: "a.txt", data: "x" }]))).rejects.toThrow(/workbook/);
    const zip = makeZip([
      { name: "xl/workbook.xml", data: '<workbook><sheets><sheet name="S" sheetId="1"/></sheets></workbook>' },
      { name: "xl/worksheets/sheet1.xml", data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c></row></sheetData></worksheet>' },
    ]);
    await expect(readXlsx(zip)).rejects.toThrow(/shared string/);
  });
});
