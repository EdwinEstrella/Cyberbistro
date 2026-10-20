import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import type { SubmissionItem } from "./ecfCertificationRun";
import { buildPrintedPdf, jsPdfMeasure } from "./ecfPrintedPdf";
import { QR_BOTTOM_CLEARANCE, QR_LEFT, QR_SIZE, ROLL_WIDTH, SIDE_MARGIN, layoutReceipt, wrapText, type LayoutBox } from "./ecfReceiptLayout";
import {
  PRINTED_SLOTS,
  buildPrintedQrUrl,
  dgiiEnvironmentSegment,
  formatAmount,
  isConsumoUnder250k,
  isExemptItem,
  itemItbisAmount,
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

  const mediaBox = (bytes: Uint8Array) => {
    const match = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(new TextDecoder("latin1").decode(bytes));
    const toMm = (pt: string) => (Number(pt) * 25.4) / 72;
    return { width: toMm(match![1]), height: toMm(match![2]) };
  };
  const build = (model: ReturnType<typeof parse>) =>
    buildPrintedPdf({ model, securityCode: "a+b/C9", qrUrl: "https://ecf.dgii.gov.do/certecf/consultatimbre" });
  const manyItems = (count: number) =>
    parse(E31.replace(ITEM, Array.from({ length: count }, (_, i) => ITEM.replace("<NumeroLinea>1</NumeroLinea>", `<NumeroLinea>${i + 1}</NumeroLinea>`)).join("")));

  it("renders one 80 mm page whose height grows with the item count", async () => {
    const few = mediaBox(await build(manyItems(2)));
    const many = mediaBox(await build(manyItems(40)));
    expect(few.width).toBeCloseTo(80, 1);
    expect(many.width).toBeCloseTo(80, 1);
    expect(many.height).toBeGreaterThan(few.height + 100);
    const pages = new TextDecoder("latin1").decode(await build(manyItems(40))).match(/\/Type \/Page\b/g) ?? [];
    expect(pages).toHaveLength(1);
  });
});

describe("layoutReceipt", () => {
  const measure = jsPdfMeasure();
  const LONG_NAME = "DOCUMENTOS ELECTRONICOS PRUEBA FACTURA DE CONSUMO MENOR 250MIL";
  const LONG_EMAIL = "facturacion.electronica.salpimentao@restaurante-ejemplo.com.do";
  const longModel = () => {
    const model = parse(E31);
    model.emisor.razonSocial = LONG_NAME;
    model.emisor.nombreComercial = "SALPIMENTAO RESTAURANT CAFE & GRILL SRL";
    model.emisor.correo = LONG_EMAIL;
    model.items[0].indicadorFacturacion = "4";
    model.items[0].nombreItem = "Pechuga a la plancha con guarnición de vegetales salteados y puré";
    return model;
  };
  const intersects = (a: LayoutBox, b: LayoutBox) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

  it("keeps every box inside the side margins and never overlaps two boxes", () => {
    for (const model of [longModel(), parse(E31), parse(E32_CONSUMO), parse(E43), parse(E34)]) {
      const { boxes, height } = layoutReceipt(model, "a+b/C9", measure);
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(SIDE_MARGIN - 1e-6);
        expect(box.x + box.w).toBeLessThanOrEqual(ROLL_WIDTH - SIDE_MARGIN + 1e-6);
        expect(box.y + box.h).toBeLessThanOrEqual(height);
      }
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(intersects(a, b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(false)));
    }
  });

  it("wraps the long razón social and breaks an e-mail that has no spaces", () => {
    const { boxes } = layoutReceipt(longModel(), "a+b/C9", measure);
    const text = boxes.filter((box): box is Extract<LayoutBox, { kind: "text" }> => box.kind === "text").map((box) => box.text);
    expect(text.filter((line) => LONG_NAME.includes(line) && line.length > 3).length).toBeGreaterThan(1);
    expect(text.join("")).toContain(LONG_EMAIL);
    expect(text.filter((line) => LONG_EMAIL.includes(line) && line !== LONG_EMAIL).length).toBeGreaterThan(1);
    expect(wrapText("a".repeat(80), 30, 8, "normal", measure).length).toBeGreaterThan(1);
  });

  it("puts the exempt marker left of the description, on its own column", () => {
    const { boxes } = layoutReceipt(longModel(), "a+b/C9", measure);
    const marker = boxes.find((box) => box.kind === "text" && box.text === "E")!;
    const description = boxes.find((box) => box.kind === "text" && box.text.startsWith("Pechuga"))!;
    expect(marker.y).toBe(description.y);
    expect(marker.x + marker.w).toBeLessThan(description.x);
  });

  it("places the QR per DGII: >= 22 mm, >= 20 mm from the left and bottom edges, texts directly below", () => {
    const { boxes, height } = layoutReceipt(parse(E31), "a+b/C9", measure);
    const qr = boxes.find((box) => box.kind === "qr")!;
    expect(qr.w).toBeGreaterThanOrEqual(22);
    expect(qr.w).toBe(QR_SIZE);
    expect(qr.x).toBeGreaterThanOrEqual(20);
    expect(qr.x).toBe(QR_LEFT);
    expect(height - (qr.y + qr.h)).toBeGreaterThanOrEqual(QR_BOTTOM_CLEARANCE);
    const under = boxes.filter((box) => box.kind === "text" && box.y >= qr.y + qr.h);
    expect(under.map((box) => box.kind === "text" && box.text).join(" ")).toContain("Código de Seguridad: a+b/C9");
    expect(under.map((box) => box.kind === "text" && box.text).join(" ")).toContain("Fecha de Firma Digital:");
    expect(under.every((box) => box.x >= 20)).toBe(true);
  });
});

describe("itemItbisAmount", () => {
  it("applies the rate to MontoItem when prices exclude ITBIS", () => {
    expect(itemItbisAmount("1000.00", "1", undefined)).toBe("180.00");
    expect(itemItbisAmount("1000.00", "2", "0")).toBe("160.00");
    expect(itemItbisAmount("1000.00", "3", undefined)).toBe("0.00");
  });

  it("extracts the ITBIS already included when IndicadorMontoGravado is 1", () => {
    expect(itemItbisAmount("1180.00", "1", "1")).toBe("180.00");
  });

  it("returns undefined for exempt, non-billable or missing amounts", () => {
    expect(itemItbisAmount("1000.00", "4", undefined)).toBeUndefined();
    expect(itemItbisAmount("1000.00", "0", undefined)).toBeUndefined();
    expect(itemItbisAmount(undefined, "1", undefined)).toBeUndefined();
  });

  it("flags only exempt lines for the E marker", () => {
    expect(isExemptItem("4")).toBe(true);
    expect(isExemptItem("1")).toBe(false);
  });
});
