import { describe, expect, it } from "vitest";
import { TestSetError } from "../supabase/functions/ecf-certification/builder";
import {
  allocateSequences,
  buildSimulationSet,
  computeEmissionDays,
  creditNoteIndicator,
  dgiiToday,
  formatDgiiDay,
  formatEncf,
  maxSequencesByTipo,
  parseDgiiDate,
} from "../supabase/functions/ecf-certification/simulation";
import type { Sheet } from "../supabase/functions/ecf-certification/xlsx";

const RNC = "133488485";
const E = "#e";
// 18-10-2026 10:00 in Dominican Republic time.
const NOW = new Date("2026-10-18T14:00:00Z");

describe("sequence allocator", () => {
  it("takes the highest issued sequence per tipo and ignores malformed values", () => {
    const max = maxSequencesByTipo(["E310000000010", "E310000000002", "E320000000015", "B0100000001", "E34000000001"]);
    expect([...max.entries()]).toEqual([
      ["31", 10],
      ["32", 15],
    ]);
  });

  it("allocates max + 1 per tipo, independently, in document order", () => {
    const docs = ["E310000000001", "E320000000006", "E310000000004", "E330000000001", "E320000000012"].map((encf) => ({ encf, tipoEcf: encf.slice(1, 3) }));
    const mapping = allocateSequences(docs, ["E310000000010", "E320000000015", "E330000000001"]);
    expect(Object.fromEntries(mapping)).toEqual({
      E310000000001: "E310000000011",
      E320000000006: "E320000000016",
      E310000000004: "E310000000012",
      E330000000001: "E330000000002",
      E320000000012: "E320000000017",
    });
    // A tipo without history starts at 1.
    expect(allocateSequences([{ encf: "E470000000008", tipoEcf: "47" }], []).get("E470000000008")).toBe("E470000000001");
  });

  it("formats E + tipo + 10 digits and refuses exhausted ranges", () => {
    expect(formatEncf("45", 7)).toBe("E450000000007");
    expect(() => formatEncf("45", 10_000_000_000)).toThrow(TestSetError);
    expect(() => formatEncf("4", 1)).toThrow(TestSetError);
  });
});

describe("dates", () => {
  it("parses and formats dd-MM-yyyy and rejects impossible dates", () => {
    const day = parseDgiiDate("01-04-2020")!;
    expect(formatDgiiDay(day)).toBe("01-04-2020");
    expect(formatDgiiDay(day + 192)).toBe("10-10-2020");
    expect(parseDgiiDate("31-02-2020")).toBeNull();
    expect(parseDgiiDate("2020-04-01")).toBeNull();
  });

  it("uses the Dominican Republic day", () => {
    expect(formatDgiiDay(dgiiToday(new Date("2026-10-19T03:59:00Z")))).toBe("18-10-2026");
    expect(formatDgiiDay(dgiiToday(new Date("2026-10-19T04:00:00Z")))).toBe("19-10-2026");
  });

  it("IndicadorNotaCredito is 0 within 30 days of the modified document, else 1", () => {
    expect(creditNoteIndicator(100, 100)).toBe("0");
    expect(creditNoteIndicator(130, 100)).toBe("0");
    expect(creditNoteIndicator(131, 100)).toBe("1");
  });
});

// ---- workbook --------------------------------------------------------------------------------------
const HEADER = [
  "CasoPrueba", "Version", "TipoeCF", "ENCF", "FechaVencimientoSecuencia", "IndicadorNotaCredito", "FechaLimitePago", "RNCEmisor", "FechaEmision",
  "FechaEntrega", "FechaOrdenCompra", "FechaEmbarque", "MontoTotal", "NumeroLinea[1]", "NombreItem[1]", "FechaVencimientoItem[1]", "MontoItem[1]",
  "NCFModificado", "FechaNCFModificado", "CodigoModificacion",
];
type Cells = Partial<Record<string, string>>;
const row = (encf: string, cells: Cells = {}) => {
  const base: Cells = {
    CasoPrueba: `${RNC}${encf}`, Version: "1.0", TipoeCF: encf.slice(1, 3), ENCF: encf, RNCEmisor: RNC, FechaEmision: "01-04-2020",
    MontoTotal: "100.00", "NumeroLinea[1]": "1", "NombreItem[1]": "PAN", "MontoItem[1]": "100.00", ...cells,
  };
  return HEADER.map((name) => base[name] ?? E);
};
const RFCE_HEADER = ["CasoPrueba", "Version", "TipoeCF", "ENCF", "RNCEmisor", "FechaEmision", "MontoTotal", "CodigoSeguridadeCF"];
const rfce = (encf: string) => [`${RNC}${encf}`, "1.0", "32", encf, RNC, "01-04-2020", "100.00", E];

function workbook(): Sheet[] {
  return [
    {
      name: "ECF",
      rows: [
        HEADER,
        row("E330000000001", { FechaEmision: "02-04-2020", NCFModificado: "E320000000006", FechaNCFModificado: "01-04-2020", CodigoModificacion: "3" }),
        row("E320000000006", { FechaEntrega: "10-10-2020", FechaOrdenCompra: "10-11-2018" }),
        row("E340000000016", { IndicadorNotaCredito: "1", FechaEmision: "01-12-2020", NCFModificado: "E410000000010", FechaNCFModificado: "01-04-2020", CodigoModificacion: "2" }),
        row("E410000000010", { FechaVencimientoSecuencia: "31-12-2028" }),
        row("E460000000001", { FechaVencimientoSecuencia: "31-12-2028", FechaLimitePago: "06-05-2020", FechaEntrega: "07-04-2020", FechaOrdenCompra: "10-03-2020", FechaEmbarque: "10-04-2020", "FechaVencimientoItem[1]": "01-04-2021" }),
        row("E340000000002", { IndicadorNotaCredito: "0", FechaEmision: "05-04-2020", NCFModificado: "E310000000999", FechaNCFModificado: "01-01-2020", CodigoModificacion: "2" }),
        row("E320000000012"),
        HEADER.map(() => E),
      ],
    },
    { name: "RFCE", rows: [RFCE_HEADER, rfce("E320000000012")] },
  ];
}

const ISSUED = ["E310000000010", "E320000000015", "E330000000001", "E340000000016", "E410000000010", "E460000000007"];
const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, "g"))].map((m) => m[1]);

describe("buildSimulationSet", () => {
  const set = buildSimulationSet(workbook(), { issued: ISSUED, now: NOW });
  const doc = (encf: string) => set.ecf.find((d) => d.encf === encf)!;

  it("re-issues every document with new e-NCF, case ids and a pointer to the source case", () => {
    expect(set.ecf.map((d) => d.encf)).toEqual(["E330000000002", "E320000000016", "E340000000017", "E410000000011", "E460000000008", "E340000000018", "E320000000017"]);
    expect(set.fechaEmision).toBe("18-10-2026");
    for (const d of set.ecf) {
      expect(d.caseId).toBe(`${RNC}${d.encf}`);
      expect(tag(d.xml, "eNCF")).toEqual([d.encf]);
      expect(tag(d.xml, "FechaEmision")).toEqual(["18-10-2026"]);
    }
    expect(doc("E330000000002").sourceCaseId).toBe(`${RNC}E330000000001`);
    expect(set.mapping.get("E410000000010")).toBe("E410000000011");
  });

  it("remaps in-workbook references to the new e-NCF and today, and recomputes the credit-note indicator", () => {
    const debit = doc("E330000000002").xml;
    expect(tag(debit, "NCFModificado")).toEqual(["E320000000016"]);
    expect(tag(debit, "FechaNCFModificado")).toEqual(["18-10-2026"]);
    expect(doc("E330000000002").references).toBe("E320000000016");
    const credit = doc("E340000000017").xml;
    expect(tag(credit, "NCFModificado")).toEqual(["E410000000011"]);
    expect(tag(credit, "IndicadorNotaCredito")).toEqual(["0"]);
  });

  it("keeps a reference outside the workbook and recomputes its indicator against the original date", () => {
    const note = doc("E340000000018").xml;
    expect(tag(note, "NCFModificado")).toEqual(["E310000000999"]);
    expect(tag(note, "FechaNCFModificado")).toEqual(["01-01-2020"]);
    expect(tag(note, "IndicadorNotaCredito")).toEqual(["1"]);
  });

  it("shifts the other dates by the FechaEmision delta and keeps FechaVencimientoSecuencia", () => {
    const xml = doc("E460000000008").xml;
    // Original FechaEmision 01-04-2020 -> 18-10-2026 (+2391 days).
    expect(tag(xml, "FechaLimitePago")).toEqual(["22-11-2026"]);
    expect(tag(xml, "FechaEntrega")).toEqual(["24-10-2026"]);
    expect(tag(xml, "FechaOrdenCompra")).toEqual(["26-09-2026"]);
    expect(tag(xml, "FechaEmbarque")).toEqual(["27-10-2026"]);
    expect(tag(xml, "FechaVencimientoItem")).toEqual(["18-10-2027"]);
    expect(tag(xml, "FechaVencimientoSecuencia")).toEqual(["31-12-2028"]);
    // Order relative to FechaEmision is preserved (purchase order before issue).
    expect(tag(doc("E320000000016").xml, "FechaOrdenCompra")).toEqual(["28-05-2025"]);
  });

  it("gives each RFCE the new e-NCF and date of its E32", () => {
    expect(set.rfce).toHaveLength(1);
    expect(set.rfce[0].encf).toBe("E320000000017");
    expect(set.rfce[0].caseId).toBe(`${RNC}E320000000017`);
    expect(set.rfce[0].sourceCaseId).toBe(`${RNC}E320000000012`);
    expect(tag(set.rfce[0].xml, "FechaEmision")).toEqual(["18-10-2026"]);
  });

  it("fails loudly on a missing or invalid FechaEmision or shifted date", () => {
    const broken = workbook();
    broken[0].rows[2][HEADER.indexOf("FechaEmision")] = E;
    expect(() => buildSimulationSet(broken, { issued: [], now: NOW })).toThrow(/FechaEmision/);
    const badDate = workbook();
    badDate[0].rows[2][HEADER.indexOf("FechaEntrega")] = "2020-10-10";
    expect(() => buildSimulationSet(badDate, { issued: [], now: NOW })).toThrow(/FechaEntrega/);
  });
});

describe("buildSimulationSet emisor override", () => {
  const PLACEHOLDER = "DOCUMENTOS ELECTRONICOS DE 02";
  const LEGAL = "SALPIMENTAO RESTAURANT CAFE & GRILL SRL";
  const withEmisor = (): Sheet[] => {
    const [ecf, rfceSheet] = workbook();
    const ecfHeader = [...HEADER, "RazonSocialEmisor", "NombreComercial"];
    const rfceHeader = [...RFCE_HEADER, "RazonSocialEmisor"];
    return [
      { name: "ECF", rows: [ecfHeader, ...ecf.rows.slice(1).map((r) => (r.every((c) => c === E) ? [...r, E, E] : [...r, PLACEHOLDER, PLACEHOLDER]))] },
      { name: "RFCE", rows: [rfceHeader, ...rfceSheet.rows.slice(1).map((r) => [...r, PLACEHOLDER])] },
    ];
  };

  it("writes the escaped legal name into every ECF and RFCE document", () => {
    const set = buildSimulationSet(withEmisor(), { issued: ISSUED, now: NOW, emisor: { razonSocial: `  ${LEGAL} ` } });
    expect(set.ecf.length).toBeGreaterThan(0);
    for (const d of set.ecf) {
      expect(tag(d.xml, "RazonSocialEmisor")).toEqual(["SALPIMENTAO RESTAURANT CAFE &amp; GRILL SRL"]);
      expect(tag(d.xml, "NombreComercial")).toEqual(["SALPIMENTAO RESTAURANT CAFE &amp; GRILL SRL"]);
    }
    expect(tag(set.rfce[0].xml, "RazonSocialEmisor")).toEqual(["SALPIMENTAO RESTAURANT CAFE &amp; GRILL SRL"]);
    expect(set.rfce[0].xml).not.toContain("NombreComercial");
  });

  it("leaves the workbook values untouched without an override or with a blank one", () => {
    for (const emisor of [undefined, { razonSocial: "   " }]) {
      const set = buildSimulationSet(withEmisor(), { issued: ISSUED, now: NOW, emisor });
      for (const d of set.ecf) expect(tag(d.xml, "RazonSocialEmisor")).toEqual([PLACEHOLDER]);
      expect(tag(set.rfce[0].xml, "RazonSocialEmisor")).toEqual([PLACEHOLDER]);
    }
  });

  it("tolerates workbooks without the emisor columns", () => {
    const set = buildSimulationSet(workbook(), { issued: ISSUED, now: NOW, emisor: { razonSocial: LEGAL } });
    expect(set.ecf).toHaveLength(7);
  });
});

describe("additional-tax rate preservation", () => {
  const TAX_HEADER = [
    ...HEADER,
    "TipoImpuesto[1]",
    "TasaImpuestoAdicional[1]",
    "MontoImpuestoSelectivoConsumoEspecifico[1]",
    "TipoImpuesto[2]",
    "TasaImpuestoAdicional[2]",
  ];

  const taxRow = (encf: string, cells: Cells = {}) => {
    const base: Cells = {
      CasoPrueba: `${RNC}${encf}`,
      Version: "1.0",
      TipoeCF: encf.slice(1, 3),
      ENCF: encf,
      RNCEmisor: RNC,
      FechaEmision: "01-04-2020",
      MontoTotal: "100.00",
      "NumeroLinea[1]": "1",
      "NombreItem[1]": "CERVEZA",
      "MontoItem[1]": "100.00",
      ...cells,
    };
    return TAX_HEADER.map((name) => base[name] ?? E);
  };

  it("computeEmissionDays sets original FechaEmision for rate-carrying rows and today for others", () => {
    const todayDay = dgiiToday(NOW);
    const originalDay = parseDgiiDate("01-04-2020")!;
    const sheet: Sheet = {
      name: "ECF",
      rows: [
        TAX_HEADER,
        taxRow("E450000000001", { "TasaImpuestoAdicional[1]": "633.85" }),
        taxRow("E310000000001", { "TasaImpuestoAdicional[1]": E, "TasaImpuestoAdicional[2]": "" }),
        taxRow("E320000000001", { "TasaImpuestoAdicional[2]": "10" }),
      ],
    };
    const days = computeEmissionDays(sheet, todayDay);
    expect(days.get("E450000000001")).toBe(originalDay);
    expect(days.get("E310000000001")).toBe(todayDay);
    expect(days.get("E320000000001")).toBe(originalDay);
  });

  it("keeps original FechaEmision and unshifted dates for rows carrying TasaImpuestoAdicional (a), while rows without it get today (b)", () => {
    const wb: Sheet[] = [
      {
        name: "ECF",
        rows: [
          TAX_HEADER,
          // (a) Row with additional-tax rates (simulating prod COMEDOR NUEVO MILENIO case: TipoImpuesto 006 rate 633.85, TipoImpuesto 023 rate 10)
          taxRow("E450000000001", {
            FechaEmision: "01-04-2020",
            FechaEntrega: "10-04-2020",
            FechaOrdenCompra: "15-03-2020",
            "TipoImpuesto[1]": "006",
            "TasaImpuestoAdicional[1]": "633.85",
            "MontoImpuestoSelectivoConsumoEspecifico[1]": "633.85",
            "TipoImpuesto[2]": "023",
            "TasaImpuestoAdicional[2]": "10",
          }),
          // (b) Row without additional-tax rates
          taxRow("E310000000001", {
            FechaEmision: "01-04-2020",
            FechaEntrega: "10-04-2020",
            FechaOrdenCompra: "15-03-2020",
          }),
        ],
      },
    ];

    const set = buildSimulationSet(wb, { issued: [], now: NOW });
    const e45 = set.ecf.find((d) => d.tipoEcf === "45")!;
    const e31 = set.ecf.find((d) => d.tipoEcf === "31")!;

    // (a) Rate-carrying row keeps its original FechaEmision (01-04-2020) and unshifted dates
    expect(tag(e45.xml, "FechaEmision")).toEqual(["01-04-2020"]);
    expect(tag(e45.xml, "FechaEntrega")).toEqual(["10-04-2020"]);
    expect(tag(e45.xml, "FechaOrdenCompra")).toEqual(["15-03-2020"]);

    // (b) Row without additional taxes gets today (18-10-2026) and shifted dates (+2391 days)
    expect(tag(e31.xml, "FechaEmision")).toEqual(["18-10-2026"]);
    expect(tag(e31.xml, "FechaEntrega")).toEqual(["27-10-2026"]);
    expect(tag(e31.xml, "FechaOrdenCompra")).toEqual(["01-10-2026"]);
  });

  it("credit note referencing a rate-carrying document gets that document's original date in FechaNCFModificado and the right IndicadorNotaCredito (c)", () => {
    const wb: Sheet[] = [
      {
        name: "ECF",
        rows: [
          TAX_HEADER,
          // Rate-carrying invoice issued 01-04-2020
          taxRow("E450000000001", {
            FechaEmision: "01-04-2020",
            "TipoImpuesto[1]": "006",
            "TasaImpuestoAdicional[1]": "633.85",
          }),
          // Standard invoice issued today (18-10-2026 in simulation)
          taxRow("E310000000001", {
            FechaEmision: "01-04-2020",
          }),
          // Credit note modifying the rate-carrying invoice: note issued today (18-10-2026) -> modified date 01-04-2020 -> >30 days -> indicator 1
          taxRow("E340000000001", {
            FechaEmision: "01-04-2020",
            NCFModificado: "E450000000001",
            FechaNCFModificado: "01-04-2020",
            IndicadorNotaCredito: "0",
            CodigoModificacion: "2",
          }),
          // Credit note modifying the standard invoice: note issued today (18-10-2026) -> modified date 18-10-2026 -> 0 days <= 30 -> indicator 0
          taxRow("E340000000002", {
            FechaEmision: "01-04-2020",
            NCFModificado: "E310000000001",
            FechaNCFModificado: "01-04-2020",
            IndicadorNotaCredito: "1",
            CodigoModificacion: "2",
          }),
          // Rate-carrying credit note issued on 05-04-2020 modifying rate-carrying invoice (01-04-2020): 4 days <= 30 -> indicator 0
          taxRow("E340000000003", {
            FechaEmision: "05-04-2020",
            NCFModificado: "E450000000001",
            FechaNCFModificado: "01-04-2020",
            IndicadorNotaCredito: "1",
            CodigoModificacion: "2",
            "TipoImpuesto[1]": "006",
            "TasaImpuestoAdicional[1]": "633.85",
          }),
        ],
      },
    ];

    const set = buildSimulationSet(wb, { issued: [], now: NOW });
    const note1 = set.ecf.find((d) => d.sourceCaseId === `${RNC}E340000000001`)!;
    const note2 = set.ecf.find((d) => d.sourceCaseId === `${RNC}E340000000002`)!;
    const note3 = set.ecf.find((d) => d.sourceCaseId === `${RNC}E340000000003`)!;

    // Note 1: modified document has additional taxes so its FechaNCFModificado remains 01-04-2020
    expect(tag(note1.xml, "FechaNCFModificado")).toEqual(["01-04-2020"]);
    expect(tag(note1.xml, "FechaEmision")).toEqual(["18-10-2026"]);
    expect(tag(note1.xml, "IndicadorNotaCredito")).toEqual(["1"]);

    // Note 2: modified document has no additional taxes, so modified date is 18-10-2026
    expect(tag(note2.xml, "FechaNCFModificado")).toEqual(["18-10-2026"]);
    expect(tag(note2.xml, "FechaEmision")).toEqual(["18-10-2026"]);
    expect(tag(note2.xml, "IndicadorNotaCredito")).toEqual(["0"]);

    // Note 3: note itself carries additional tax so its FechaEmision is 05-04-2020; modified is 01-04-2020 (diff 4 days <= 30) -> indicator 0
    expect(tag(note3.xml, "FechaNCFModificado")).toEqual(["01-04-2020"]);
    expect(tag(note3.xml, "FechaEmision")).toEqual(["05-04-2020"]);
    expect(tag(note3.xml, "IndicadorNotaCredito")).toEqual(["0"]);
  });

  it("RFCE follows the FechaEmision of its matching E32 from the map (d)", () => {
    const wb: Sheet[] = [
      {
        name: "ECF",
        rows: [
          TAX_HEADER,
          // E32 carrying additional tax rate -> keeps original date 01-04-2020
          taxRow("E320000000001", {
            FechaEmision: "01-04-2020",
            "TipoImpuesto[1]": "023",
            "TasaImpuestoAdicional[1]": "10",
          }),
        ],
      },
      {
        name: "RFCE",
        rows: [RFCE_HEADER, rfce("E320000000001")],
      },
    ];

    const set = buildSimulationSet(wb, { issued: [], now: NOW });
    const e32 = set.ecf.find((d) => d.tipoEcf === "32")!;
    expect(set.rfce).toHaveLength(1);
    const rfceDoc = set.rfce[0];

    expect(tag(e32.xml, "FechaEmision")).toEqual(["01-04-2020"]);
    expect(tag(rfceDoc.xml, "FechaEmision")).toEqual(["01-04-2020"]);
  });
});
