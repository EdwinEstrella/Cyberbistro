import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import type { SubmissionItem } from "./ecfCertificationRun";
import { buildPrintedPdf } from "./ecfPrintedPdf";
import {
  PRINTED_SLOTS,
  buildPrintedQrUrl,
  dgiiEnvironmentSegment,
  formatAmount,
  isConsumoUnder250k,
  parseSignedEcf,
  pickPrintedSlots,
  printedFileName,
  resolveSecurityCode,
  securityCodeFromSignature,
  slotMismatch,
} from "./ecfPrintedRepresentation";

const parser = new DOMParser() as unknown as { parseFromString(xml: string, type: "text/xml"): Document };
const parse = (xml: string) => parseSignedEcf(xml, parser);

const SIGNATURE = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></SignedInfo><SignatureValue>
  a+b/C9xyzQWERTYUIOP==
</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIB</X509Certificate></X509Data></KeyInfo></Signature>`;

function ecf(opts: { idDoc: string; comprador?: string; totales: string; items: string; extra?: string; tail?: string }) {
  return `<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version><IdDoc>${opts.idDoc}</IdDoc>` +
    `<Emisor><RNCEmisor>131880681</RNCEmisor><RazonSocialEmisor>Salpimentao SRL</RazonSocialEmisor><NombreComercial>Salpimentao</NombreComercial>` +
    `<DireccionEmisor>Av. Duarte 12</DireccionEmisor><Municipio>010100</Municipio><Provincia>010000</Provincia>` +
    `<TablaTelefonoEmisor><TelefonoEmisor>809-555-0101</TelefonoEmisor><TelefonoEmisor>809-555-0102</TelefonoEmisor></TablaTelefonoEmisor>` +
    `<CorreoEmisor>caja@example.com</CorreoEmisor><FechaEmision>18-10-2026</FechaEmision></Emisor>` +
    `${opts.comprador ?? ""}<Totales>${opts.totales}</Totales>${opts.extra ?? ""}</Encabezado>` +
    `<DetallesItems>${opts.items}</DetallesItems>${opts.tail ?? ""}<FechaHoraFirma>18-10-2026 14:05:09</FechaHoraFirma>${SIGNATURE}</ECF>`;
}

const ITEM = `<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>1</IndicadorFacturacion><NombreItem>Pechuga a la plancha con guarnición</NombreItem><IndicadorBienoServicio>1</IndicadorBienoServicio><CantidadItem>2.00</CantidadItem><UnidadMedida>43</UnidadMedida><PrecioUnitarioItem>500.00</PrecioUnitarioItem><MontoItem>1000.00</MontoItem></Item>`;

const E31 = ecf({
  idDoc: "<TipoeCF>31</TipoeCF><eNCF>E310000000011</eNCF><FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia><IndicadorMontoGravado>0</IndicadorMontoGravado><TipoIngresos>01</TipoIngresos><TipoPago>2</TipoPago><FechaLimitePago>17-11-2026</FechaLimitePago>",
  comprador: "<Comprador><RNCComprador>101023122</RNCComprador><RazonSocialComprador>Ferretería Ñandú SRL</RazonSocialComprador><DireccionComprador>Calle 5</DireccionComprador></Comprador>",
  totales: "<MontoGravadoTotal>1000.00</MontoGravadoTotal><MontoGravadoI1>1000.00</MontoGravadoI1><ITBIS1>18</ITBIS1><TotalITBIS>180.00</TotalITBIS><TotalITBIS1>180.00</TotalITBIS1><MontoTotal>1180.00</MontoTotal>",
  items: ITEM,
});

const E32_CONSUMO = ecf({
  idDoc: "<TipoeCF>32</TipoeCF><eNCF>E320000000017</eNCF><IndicadorMontoGravado>0</IndicadorMontoGravado><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago>",
  totales: "<MontoGravadoTotal>1000.00</MontoGravadoTotal><MontoGravadoI1>1000.00</MontoGravadoI1><TotalITBIS>180.00</TotalITBIS><TotalITBIS1>180.00</TotalITBIS1><MontoTotal>1180.00</MontoTotal>",
  items: ITEM,
});

const E43 = ecf({
  idDoc: "<TipoeCF>43</TipoeCF><eNCF>E430000000013</eNCF><FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>",
  totales: "<MontoExento>350.00</MontoExento><MontoTotal>350.00</MontoTotal>",
  items: `<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>4</IndicadorFacturacion><NombreItem>Peaje</NombreItem><CantidadItem>1</CantidadItem><PrecioUnitarioItem>350.00</PrecioUnitarioItem><MontoItem>350.00</MontoItem></Item>`,
});

const E34 = ecf({
  idDoc: "<TipoeCF>34</TipoeCF><eNCF>E340000000017</eNCF><IndicadorNotaCredito>0</IndicadorNotaCredito>",
  comprador: "<Comprador><RNCComprador>101023122</RNCComprador><RazonSocialComprador>Ferretería Ñandú SRL</RazonSocialComprador></Comprador>",
  totales: "<MontoGravadoTotal>100.00</MontoGravadoTotal><TotalITBIS>18.00</TotalITBIS><MontoTotal>118.00</MontoTotal><TotalITBISRetenido>18.00</TotalITBISRetenido><TotalISRRetencion>10.00</TotalISRRetencion>",
  items: `<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>1</IndicadorFacturacion><Retencion><IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion><MontoITBISRetenido>18.00</MontoITBISRetenido><MontoISRRetenido>10.00</MontoISRRetenido></Retencion><NombreItem>Devolución</NombreItem><CantidadItem>1</CantidadItem><PrecioUnitarioItem>100.00</PrecioUnitarioItem><MontoItem>100.00</MontoItem></Item>`,
  tail: "<InformacionReferencia><NCFModificado>E310000000011</NCFModificado><FechaNCFModificado>18-10-2026</FechaNCFModificado><CodigoModificacion>3</CodigoModificacion><RazonModificacion>Corrección de montos</RazonModificacion></InformacionReferencia>",
});

describe("parseSignedEcf", () => {
  it("reads the printable fields of an E31 with buyer", () => {
    const model = parse(E31);
    expect(model).toMatchObject({
      tipoEcf: "31",
      encf: "E310000000011",
      fechaVencimientoSecuencia: "31-12-2027",
      tipoPago: "2",
      fechaLimitePago: "17-11-2026",
      fechaHoraFirma: "18-10-2026 14:05:09",
      signatureValue: "a+b/C9xyzQWERTYUIOP==",
      emisor: { rnc: "131880681", razonSocial: "Salpimentao SRL", telefonos: ["809-555-0101", "809-555-0102"], fechaEmision: "18-10-2026" },
      comprador: { rnc: "101023122", razonSocial: "Ferretería Ñandú SRL", direccion: "Calle 5" },
      totales: { MontoTotal: "1180.00", TotalITBIS1: "180.00", MontoGravadoI1: "1000.00" },
    });
    expect(model.items).toEqual([
      expect.objectContaining({ numeroLinea: "1", nombreItem: "Pechuga a la plancha con guarnición", cantidadItem: "2.00", montoItem: "1000.00", indicadorFacturacion: "1" }),
    ]);
    expect(model.referencia).toBeUndefined();
    expect(model.otraMoneda).toBeUndefined();
    expect(model.totales.MontoExento).toBeUndefined();
  });

  it("reads the reference and retentions of an E34", () => {
    const model = parse(E34);
    expect(model.referencia).toEqual({ ncfModificado: "E310000000011", fechaNcfModificado: "18-10-2026", codigoModificacion: "3", razonModificacion: "Corrección de montos" });
    expect(model.items[0]).toMatchObject({ montoItbisRetenido: "18.00", montoIsrRetenido: "10.00" });
    expect(model.totales).toMatchObject({ TotalITBISRetenido: "18.00", TotalISRRetencion: "10.00" });
    expect(model.fechaVencimientoSecuencia).toBeUndefined();
  });

  it("has no buyer for an E43 without Comprador", () => {
    expect(parse(E43).comprador).toBeUndefined();
  });

  it("throws a clear error when a required element is missing", () => {
    expect(() => parse(E31.replace(/<SignatureValue>[\s\S]*?<\/SignatureValue>/, ""))).toThrow(/SignatureValue/);
    expect(() => parse(E31.replace("<MontoTotal>1180.00</MontoTotal>", ""))).toThrow(/MontoTotal/);
    expect(() => parse("<RFCE><Encabezado/></RFCE>")).toThrow(/ECF root/);
  });
});

describe("security code", () => {
  it("is the first six characters of the SignatureValue", () => {
    expect(securityCodeFromSignature(" a+b/\nC9xyz ")).toBe("a+b/C9");
    expect(() => securityCodeFromSignature("abc")).toThrow();
  });

  it("prefers the stored code", () => {
    const model = parse(E31);
    expect(resolveSecurityCode(model, "ZZZ999")).toBe("ZZZ999");
    expect(resolveSecurityCode(model, null)).toBe("a+b/C9");
  });
});

describe("buildPrintedQrUrl", () => {
  const env = dgiiEnvironmentSegment("certification");

  it("builds the standard consultatimbre URL with the buyer", () => {
    expect(buildPrintedQrUrl(parse(E31), { environment: env, securityCode: "a+b/C9" })).toBe(
      "https://ecf.dgii.gov.do/certecf/consultatimbre?rncemisor=131880681&RncComprador=101023122&encf=E310000000011" +
        "&fechaemision=18-10-2026&montototal=1180.00&fechafirma=18-10-2026%2014%3A05%3A09&codigoseguridad=a%2Bb%2FC9",
    );
  });

  it("omits RncComprador for E43 and E47 even when a buyer exists", () => {
    const withBuyer = E43.replace("<Totales>", "<Comprador><RNCComprador>101023122</RNCComprador></Comprador><Totales>");
    const url = buildPrintedQrUrl(parse(withBuyer), { environment: env, securityCode: "a+b/C9" });
    expect(url).not.toContain("RncComprador");
    expect(url).toContain("rncemisor=131880681&encf=E430000000013&fechaemision=18-10-2026&montototal=350.00");
    const e47 = parse(withBuyer.replace("<TipoeCF>43</TipoeCF><eNCF>E43", "<TipoeCF>47</TipoeCF><eNCF>E47"));
    expect(buildPrintedQrUrl(e47, { environment: env, securityCode: "x" })).not.toContain("RncComprador");
  });

  it("uses the FC variant for a consumo E32 under 250 mil", () => {
    const model = parse(E32_CONSUMO);
    expect(isConsumoUnder250k(model)).toBe(true);
    expect(buildPrintedQrUrl(model, { environment: env, securityCode: "a+b/C9" })).toBe(
      "https://fc.dgii.gov.do/certecf/consultatimbrefc?rncemisor=131880681&encf=E320000000017&montototal=1180.00&codigoseguridad=a%2Bb%2FC9",
    );
  });

  it("uses the standard variant for an E32 of 250 mil or more", () => {
    const model = parse(E32_CONSUMO.replace("<MontoTotal>1180.00</MontoTotal>", "<MontoTotal>250000.00</MontoTotal>"));
    expect(isConsumoUnder250k(model)).toBe(false);
    expect(buildPrintedQrUrl(model, { environment: "testecf", securityCode: "abc123" })).toMatch(/^https:\/\/ecf\.dgii\.gov\.do\/testecf\/consultatimbre\?/);
  });

  it("maps the environment segment", () => {
    expect([dgiiEnvironmentSegment("test"), dgiiEnvironmentSegment("certification"), dgiiEnvironmentSegment("production")]).toEqual(["testecf", "certecf", "ecf"]);
  });
});

function item(overrides: Partial<SubmissionItem>): SubmissionItem {
  return {
    caseId: overrides.encf ?? "case",
    encf: "E310000000001",
    tipoEcf: (overrides.encf ?? "E31").slice(1, 3),
    kind: "ecf",
    sequenceOrder: 0,
    status: "accepted",
    trackId: null,
    messages: [],
    sourceCaseId: null,
    signed: true,
    ...overrides,
  };
}

describe("pickPrintedSlots", () => {
  it("lists the 11 portal slots in portal order", () => {
    expect(PRINTED_SLOTS.map((slot) => slot.inputName)).toEqual([
      "ECF_31", "ECF_32 Mayor_o_Igual_250mil", "ECF_33", "ECF_34", "ECF_41", "ECF_43", "ECF_44", "ECF_45", "ECF_46", "ECF_47", "ECF_32 Menor_250mil",
    ]);
  });

  it("picks the lowest accepted signed e-NCF per slot and reports missing slots", () => {
    const items = [
      item({ encf: "E310000000012" }),
      item({ encf: "E310000000011" }),
      item({ encf: "E310000000010", status: "rejected" }),
      item({ encf: "E310000000009", signed: false }),
      item({ encf: "E320000000016" }),
      item({ encf: "E320000000017", caseId: "c17", kind: "portal_upload", status: "ready_for_portal" }),
      item({ encf: "E320000000017", caseId: "c17", kind: "rfce", status: "accepted" }),
      item({ encf: "E320000000018", caseId: "c18", kind: "portal_upload", status: "ready_for_portal" }),
      item({ encf: "E320000000018", caseId: "c18", kind: "rfce", status: "rejected" }),
      item({ encf: "E340000000017", status: "accepted_conditional" }),
    ];
    const picks = Object.fromEntries(pickPrintedSlots(items).map((pick) => [pick.slot.inputName, pick.item?.encf ?? null]));
    expect(picks).toEqual({
      ECF_31: "E310000000011",
      "ECF_32 Mayor_o_Igual_250mil": "E320000000016",
      ECF_33: null,
      ECF_34: "E340000000017",
      ECF_41: null,
      ECF_43: null,
      ECF_44: null,
      ECF_45: null,
      ECF_46: null,
      ECF_47: null,
      "ECF_32 Menor_250mil": "E320000000017",
    });
  });

  it("flags a document whose amount does not match the E32 slot", () => {
    const consumo = parse(E32_CONSUMO);
    const [, gte, ...rest] = PRINTED_SLOTS;
    const lt = rest[rest.length - 1];
    expect(slotMismatch(lt, consumo)).toBeNull();
    expect(slotMismatch(gte, consumo)).toMatch(/menor a 250 mil/);
    expect(slotMismatch(PRINTED_SLOTS[0], consumo)).toMatch(/no es del tipo 31/);
  });

  it("names the file after the portal input", () => {
    expect(printedFileName(PRINTED_SLOTS[1], "E320000000016")).toBe("ECF_32_Mayor_o_Igual_250mil_E320000000016.pdf");
    expect(printedFileName(PRINTED_SLOTS[0], "E310000000011")).toBe("ECF_31_E310000000011.pdf");
  });
});

describe("formatAmount", () => {
  it("prints two decimals with thousands separators", () => {
    expect(formatAmount("1234567.5")).toBe("1,234,567.50");
    expect(formatAmount("0")).toBe("0.00");
    expect(formatAmount("-18")).toBe("-18.00");
    expect(formatAmount("n/a")).toBe("n/a");
  });
});

describe("buildPrintedPdf", () => {
  it.each([["E31", E31], ["E32", E32_CONSUMO], ["E43", E43], ["E34", E34]])("returns a PDF for %s", async (_name, xml) => {
    const model = parse(xml);
    const securityCode = resolveSecurityCode(model);
    const bytes = await buildPrintedPdf({ model, securityCode, qrUrl: buildPrintedQrUrl(model, { environment: "certecf", securityCode }) });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.length).toBeLessThan(200_000);
  });

  it("paginates a long item list", async () => {
    const many = Array.from({ length: 120 }, (_, i) => ITEM.replace("<NumeroLinea>1</NumeroLinea>", `<NumeroLinea>${i + 1}</NumeroLinea>`)).join("");
    const model = parse(E31.replace(ITEM, many));
    expect(model.items).toHaveLength(120);
    const bytes = await buildPrintedPdf({ model, securityCode: "a+b/C9", qrUrl: "https://ecf.dgii.gov.do/certecf/consultatimbre" });
    const pages = new TextDecoder("latin1").decode(bytes).match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });
});
