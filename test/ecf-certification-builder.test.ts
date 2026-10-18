import { beforeAll, describe, expect, it } from "vitest";
import {
  TestSetError,
  applySecurityCode,
  buildTestSet,
  formatDgiiDateTime,
  securityCodeFromSignedXml,
  stampSignatureTime,
} from "../supabase/functions/ecf-certification/builder";
import { readSigningMaterial, sign } from "../supabase/functions/ecf-certification/signer";
import { readXlsx, type Sheet } from "../supabase/functions/ecf-certification/xlsx";
import { createTestCertificate, type TestCertificate } from "./helpers/ecfTestCertificate";
import { makeXlsx } from "./helpers/xlsxFixture";
import { verifyXmlSignature } from "./helpers/xmlSignature";

const RNC = "133488485";
const E = "#e";

// A slice of the DGII header, in the sheet's (schema) order, with every grouping kind.
const HEADER = [
  "CasoPrueba",
  "Version",
  "TipoeCF",
  "ENCF",
  "IndicadorMontoGravado",
  "TipoIngresos",
  "TipoPago",
  "FormaPago[1]",
  "MontoPago[1]",
  "FormaPago[2]",
  "MontoPago[2]",
  "RNCEmisor",
  "RazonSocialEmisor",
  "TelefonoEmisor[1]",
  "TelefonoEmisor[2]",
  "FechaEmision",
  "RNCComprador",
  "RazonSocialComprador",
  "NumeroContenedor ",
  "MontoGravadoTotal",
  "MontoImpuestoAdicional",
  "TipoImpuesto[1]",
  "TasaImpuestoAdicional[1]",
  "TipoImpuesto[2]",
  "TasaImpuestoAdicional[2]",
  "MontoTotal",
  "NumeroLinea[1]",
  "TipoCodigo[1][1]",
  "CodigoItem[1][1]",
  "TipoCodigo[1][2]",
  "CodigoItem[1][2]",
  "NombreItem[1]",
  "MontoITBISRetenido[1]",
  "TipoSubRecargo[1][1]",
  "MontosubRecargo[1][1]",
  "TipoImpuesto[1][1]",
  "TipoImpuesto[1][2]",
  "MontoItem[1]",
  "NumeroLinea[2]",
  "TipoCodigo[2][1]",
  "CodigoItem[2][1]",
  "NombreItem[2]",
  "MontoItem[2]",
  "NumeroLineaDoR[1]",
  "TipoAjuste[1]",
  "PaginaNo[1]",
  "SubtotalImpuestoAdicionalPaginaTabla[1]",
  "SubtotalImpuestoSelectivoConsumoEspecificoPagina[1][1]",
  "SubtotalOtrosImpuesto[1][1]",
  "MontoSubtotalPagina[1]",
  "NCFModificado",
  "CodigoModificacion",
];

type Row = Record<string, string>;

function row(values: Row): string[] {
  return HEADER.map((name) => values[name.trim()] ?? E);
}

const E31: Row = {
  CasoPrueba: `${RNC}E310000000001`,
  Version: "1.0",
  TipoeCF: "31",
  ENCF: "E310000000001",
  IndicadorMontoGravado: "0",
  TipoIngresos: "01",
  TipoPago: "1",
  "FormaPago[1]": "1",
  "MontoPago[1]": "100.00",
  RNCEmisor: RNC,
  RazonSocialEmisor: "EMPRESA & CIA <SRL>",
  "TelefonoEmisor[1]": "809-472-7676",
  "TelefonoEmisor[2]": "809-491-1918",
  FechaEmision: "01-04-2020",
  RNCComprador: "131880681",
  RazonSocialComprador: "CLIENTE",
  NumeroContenedor: "8019289",
  MontoGravadoTotal: "100.00",
  MontoImpuestoAdicional: "10.00",
  "TipoImpuesto[1]": "006",
  "TasaImpuestoAdicional[1]": "10.00",
  "TipoImpuesto[2]": "023",
  MontoTotal: "0118.00",
  "NumeroLinea[1]": "1",
  "TipoCodigo[1][1]": "INTERNA",
  "CodigoItem[1][1]": "1521",
  "TipoCodigo[1][2]": "EAN",
  "CodigoItem[1][2]": "0001",
  "NombreItem[1]": "ABANICOS",
  "MontoITBISRetenido[1]": "1.50",
  "TipoSubRecargo[1][1]": "%",
  "MontosubRecargo[1][1]": "2.00",
  "TipoImpuesto[1][1]": "006",
  "TipoImpuesto[1][2]": "023",
  "MontoItem[1]": "60.00",
  "NumeroLinea[2]": "2",
  "CodigoItem[2][1]": "1522",
  "NombreItem[2]": "PAN",
  "MontoItem[2]": "40.00",
  "NumeroLineaDoR[1]": "1",
  "TipoAjuste[1]": "D",
  "PaginaNo[1]": "1",
  "SubtotalImpuestoSelectivoConsumoEspecificoPagina[1][1]": "5.00",
  "MontoSubtotalPagina[1]": "118.00",
};

const E32: Row = {
  CasoPrueba: `${RNC}E320000000012`,
  Version: "1.0",
  TipoeCF: "32",
  ENCF: "E320000000012",
  TipoIngresos: "01",
  TipoPago: "1",
  RNCEmisor: RNC,
  RazonSocialEmisor: "CONSUMO",
  FechaEmision: "01-04-2020",
  MontoTotal: "47200.00",
  "NumeroLinea[1]": "1",
  "NombreItem[1]": "PAN",
  "MontoItem[1]": "47200.00",
};

const E34: Row = {
  CasoPrueba: `${RNC}E340000000001`,
  Version: "1.0",
  TipoeCF: "34",
  ENCF: "E340000000001",
  RNCEmisor: RNC,
  FechaEmision: "02-04-2020",
  MontoTotal: "0.00",
  "NumeroLinea[1]": "1",
  "NombreItem[1]": "TOP",
  "MontoItem[1]": "0.00",
  NCFModificado: "E310000000001",
  CodigoModificacion: "2",
};

const RFCE_HEADER = [
  "CasoPrueba",
  "Version",
  "TipoeCF",
  "ENCF",
  "TipoIngresos",
  "TipoPago",
  "FormaPago[1]",
  "MontoPago[1]",
  "RNCEmisor",
  "RazonSocialEmisor",
  "FechaEmision",
  "RNCComprador",
  "MontoGravadoTotal",
  "TotalITBIS",
  "MontoTotal",
  "CodigoSeguridadeCF",
];
const RFCE_ROW = [`${RNC}E320000000012`, "1.0", "32", "E320000000012", "01", "1", "1", "47200.00", RNC, "CONSUMO", "01-04-2020", E, "40000.00", "7200.00", "47200.00", E];

function sheets(ecfRows: string[][], rfceRows: string[][] = [], header = HEADER): Sheet[] {
  return [
    { name: "ECF", rows: [header, ...ecfRows] },
    { name: "RFCE", rows: [RFCE_HEADER, ...rfceRows] },
  ];
}

describe("buildTestSet", () => {
  it("nests, groups and orders the flat columns as the DGII schema", () => {
    const set = buildTestSet(sheets([row(E31)]));
    const [doc] = set.ecf;
    expect(doc).toMatchObject({ kind: "ecf", caseId: `${RNC}E310000000001`, encf: "E310000000001", tipoEcf: "31", rncEmisor: RNC, references: null });
    expect(doc.xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?><ECF>' +
        "<Encabezado><Version>1.0</Version>" +
        "<IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000001</eNCF><IndicadorMontoGravado>0</IndicadorMontoGravado><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago>" +
        "<TablaFormasPago><FormaDePago><FormaPago>1</FormaPago><MontoPago>100.00</MontoPago></FormaDePago></TablaFormasPago></IdDoc>" +
        "<Emisor><RNCEmisor>133488485</RNCEmisor><RazonSocialEmisor>EMPRESA &amp; CIA &lt;SRL&gt;</RazonSocialEmisor>" +
        "<TablaTelefonoEmisor><TelefonoEmisor>809-472-7676</TelefonoEmisor><TelefonoEmisor>809-491-1918</TelefonoEmisor></TablaTelefonoEmisor>" +
        "<FechaEmision>01-04-2020</FechaEmision></Emisor>" +
        "<Comprador><RNCComprador>131880681</RNCComprador><RazonSocialComprador>CLIENTE</RazonSocialComprador></Comprador>" +
        "<InformacionesAdicionales><NumeroContenedor>8019289</NumeroContenedor></InformacionesAdicionales>" +
        "<Totales><MontoGravadoTotal>100.00</MontoGravadoTotal><MontoImpuestoAdicional>10.00</MontoImpuestoAdicional>" +
        "<ImpuestosAdicionales><ImpuestoAdicional><TipoImpuesto>006</TipoImpuesto><TasaImpuestoAdicional>10.00</TasaImpuestoAdicional></ImpuestoAdicional>" +
        "<ImpuestoAdicional><TipoImpuesto>023</TipoImpuesto></ImpuestoAdicional></ImpuestosAdicionales>" +
        "<MontoTotal>0118.00</MontoTotal></Totales></Encabezado>" +
        "<DetallesItems><Item><NumeroLinea>1</NumeroLinea>" +
        "<TablaCodigosItem><CodigosItem><TipoCodigo>INTERNA</TipoCodigo><CodigoItem>1521</CodigoItem></CodigosItem><CodigosItem><TipoCodigo>EAN</TipoCodigo><CodigoItem>0001</CodigoItem></CodigosItem></TablaCodigosItem>" +
        "<NombreItem>ABANICOS</NombreItem><Retencion><MontoITBISRetenido>1.50</MontoITBISRetenido></Retencion>" +
        "<TablaSubRecargo><SubRecargo><TipoSubRecargo>%</TipoSubRecargo><MontoSubRecargo>2.00</MontoSubRecargo></SubRecargo></TablaSubRecargo>" +
        "<TablaImpuestoAdicional><ImpuestoAdicional><TipoImpuesto>006</TipoImpuesto></ImpuestoAdicional><ImpuestoAdicional><TipoImpuesto>023</TipoImpuesto></ImpuestoAdicional></TablaImpuestoAdicional>" +
        "<MontoItem>60.00</MontoItem></Item>" +
        "<Item><NumeroLinea>2</NumeroLinea><TablaCodigosItem><CodigosItem><CodigoItem>1522</CodigoItem></CodigosItem></TablaCodigosItem><NombreItem>PAN</NombreItem><MontoItem>40.00</MontoItem></Item></DetallesItems>" +
        "<DescuentosORecargos><DescuentoORecargo><NumeroLinea>1</NumeroLinea><TipoAjuste>D</TipoAjuste></DescuentoORecargo></DescuentosORecargos>" +
        "<Paginacion><Pagina><PaginaNo>1</PaginaNo><SubtotalImpuestoAdicional><SubtotalImpuestoSelectivoConsumoEspecificoPagina>5.00</SubtotalImpuestoSelectivoConsumoEspecificoPagina></SubtotalImpuestoAdicional>" +
        "<MontoSubtotalPagina>118.00</MontoSubtotalPagina></Pagina></Paginacion>" +
        "</ECF>",
    );
  });

  it("omits empty sections and records references", () => {
    const set = buildTestSet(sheets([row(E31), row(E34)]));
    const note = set.ecf[1];
    expect(note.references).toBe("E310000000001");
    expect(note.xml).toContain("<InformacionReferencia><NCFModificado>E310000000001</NCFModificado><CodigoModificacion>2</CodigoModificacion></InformacionReferencia></ECF>");
    expect(note.xml).not.toContain("Comprador");
    expect(note.xml).not.toContain("Paginacion");
    expect(note.xml).not.toContain("#e");
  });

  it("builds the RFCE of a consumo E32 without the security code", () => {
    const set = buildTestSet(sheets([row(E31), row(E32)], [RFCE_ROW]));
    expect(set.rfce).toHaveLength(1);
    expect(set.rfce[0]).toMatchObject({ kind: "rfce", encf: "E320000000012", tipoEcf: "32" });
    expect(set.rfce[0].xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?><RFCE><Encabezado><Version>1.0</Version>' +
        "<IdDoc><TipoeCF>32</TipoeCF><eNCF>E320000000012</eNCF><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago>" +
        "<TablaFormasPago><FormaDePago><FormaPago>1</FormaPago><MontoPago>47200.00</MontoPago></FormaDePago></TablaFormasPago></IdDoc>" +
        "<Emisor><RNCEmisor>133488485</RNCEmisor><RazonSocialEmisor>CONSUMO</RazonSocialEmisor><FechaEmision>01-04-2020</FechaEmision></Emisor>" +
        "<Totales><MontoGravadoTotal>40000.00</MontoGravadoTotal><TotalITBIS>7200.00</TotalITBIS><MontoTotal>47200.00</MontoTotal></Totales>" +
        "</Encabezado></RFCE>",
    );
  });

  it("skips blank trailing rows", () => {
    expect(buildTestSet(sheets([row(E31), [], HEADER.map(() => E)])).ecf).toHaveLength(1);
  });

  it("fails loudly on unknown columns that carry data, but tolerates empty ones", () => {
    const header = [...HEADER, "CampoNuevo"];
    const ok = buildTestSet(sheets([[...row(E31), E]], [], header));
    expect(ok.ecf).toHaveLength(1);
    expect(() => buildTestSet(sheets([[...row(E31), "dato"]], [], header))).toThrow(/CampoNuevo is not supported but has a value/);
    const marker = row(E31);
    marker[HEADER.indexOf("SubtotalImpuestoAdicionalPaginaTabla[1]")] = "x";
    expect(() => buildTestSet(sheets([marker]))).toThrow(/SubtotalImpuestoAdicionalPaginaTabla/);
  });

  it("rejects a second index on single elements when it carries data", () => {
    const header = [...HEADER, "SubtotalOtrosImpuesto[1][2]"];
    expect(() => buildTestSet(sheets([[...row(E31), "1.00"]], [], header))).toThrow(/SubtotalOtrosImpuesto\[1\]\[2\]/);
  });

  it("rejects duplicated mappings, bad indices and inconsistent identifiers", () => {
    expect(() => buildTestSet(sheets([row(E31)], [], [...HEADER, "MontoSubRecargo[1][1]"]))).toThrow(/already mapped/);
    expect(() => buildTestSet(sheets([[...row(E31), "x"]], [], [...HEADER, "NombreItem"]))).toThrow(/NombreItem is not supported/);
    expect(() => buildTestSet(sheets([row({ ...E31, TipoeCF: "32" })]))).toThrow(/TipoeCF does not match/);
    expect(() => buildTestSet(sheets([row({ ...E31, CasoPrueba: "1E310000000001" })]))).toThrow(/CasoPrueba/);
    expect(() => buildTestSet(sheets([row({ ...E31, ENCF: "B0100000001" })]))).toThrow(/ENCF/);
    expect(() => buildTestSet(sheets([row(E31), row(E31)]))).toThrow(/more than once/);
  });

  it("requires an E32 in the ECF sheet for every RFCE", () => {
    expect(() => buildTestSet(sheets([row(E31)], [RFCE_ROW]))).toThrow(/no matching E32/);
    expect(() => buildTestSet([{ name: "Hoja1", rows: [HEADER] }])).toThrow(/no ECF sheet/);
    expect(buildTestSet([{ name: "ecf", rows: [HEADER, row(E31)] }]).rfce).toEqual([]);
  });

  it("reads a synthetic workbook end to end", async () => {
    const workbook = makeXlsx([
      { name: "ECF", rows: [HEADER, row(E31), row(E32)] },
      { name: "RFCE", rows: [RFCE_HEADER, RFCE_ROW] },
    ]);
    const set = buildTestSet(await readXlsx(workbook));
    expect(set.ecf.map((d) => d.encf)).toEqual(["E310000000001", "E320000000012"]);
    expect(set.rfce.map((d) => d.encf)).toEqual(["E320000000012"]);
    expect(set.ecf[0].xml).toContain("<MontoTotal>0118.00</MontoTotal>");
  });

  it("is a TestSetError for invalid input", () => {
    expect(() => buildTestSet([])).toThrow(TestSetError);
  });
});

describe("signing helpers", () => {
  let cert: TestCertificate;
  beforeAll(() => {
    cert = createTestCertificate({ rnc: RNC });
  }, 60_000);

  it("formats FechaHoraFirma in Dominican Republic time", () => {
    expect(formatDgiiDateTime(new Date("2026-10-18T03:05:09Z"))).toBe("17-10-2026 23:05:09");
    expect(formatDgiiDateTime(new Date("2026-01-02T16:00:00Z"))).toBe("02-01-2026 12:00:00");
  });

  it("stamps FechaHoraFirma last and signs a verifiable e-CF", () => {
    const [doc] = buildTestSet(sheets([row(E31)])).ecf;
    const stamped = stampSignatureTime(doc.xml, new Date("2026-10-18T14:00:00Z"));
    expect(stamped.endsWith("<FechaHoraFirma>18-10-2026 10:00:00</FechaHoraFirma></ECF>")).toBe(true);
    expect(() => stampSignatureTime(stamped, new Date())).toThrow();
    const signed = sign(readSigningMaterial(cert.p12Bytes, cert.passphrase), stamped, "ECF");
    expect(verifyXmlSignature(signed, cert.certPem)).toBe(true);
    expect(signed.indexOf("<FechaHoraFirma>")).toBeLessThan(signed.indexOf("<Signature"));
  });

  it("derives the RFCE security code from the signed E32 and signs the RFCE", () => {
    const set = buildTestSet(sheets([row(E31), row(E32)], [RFCE_ROW]));
    const material = readSigningMaterial(cert.p12Bytes, cert.passphrase);
    const signedE32 = sign(material, stampSignatureTime(set.ecf[1].xml, new Date()), "ECF");
    const code = securityCodeFromSignedXml(signedE32);
    const signatureValue = signedE32.match(/<SignatureValue>([^<]+)<\/SignatureValue>/)![1].replace(/\s+/g, "");
    expect(code).toBe(signatureValue.slice(0, 6));
    const rfce = applySecurityCode(set.rfce[0].xml, code);
    expect(rfce.endsWith(`<CodigoSeguridadeCF>${code}</CodigoSeguridadeCF></Encabezado></RFCE>`)).toBe(true);
    expect(verifyXmlSignature(sign(material, rfce, "RFCE"), cert.certPem)).toBe(true);
    expect(() => applySecurityCode(rfce, code)).toThrow();
    expect(() => applySecurityCode(set.rfce[0].xml, "abc")).toThrow();
    expect(() => securityCodeFromSignedXml("<ECF/>")).toThrow();
  });
});
