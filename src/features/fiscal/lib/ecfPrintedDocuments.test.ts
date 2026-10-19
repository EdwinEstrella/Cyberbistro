import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { PORTAL_MAX_BYTES, buildPrintedDocument, formatBytes, totalBytes, type PrintedDocument } from "./ecfPrintedDocuments";
import { PRINTED_SLOTS } from "./ecfPrintedRepresentation";

const parser = new DOMParser() as unknown as { parseFromString(xml: string, type: "text/xml"): Document };

function signedEcf(tipo: string, encf: string, montoTotal: string, opts: { fechaFirma?: boolean } = {}) {
  return `<ECF><Encabezado><IdDoc><TipoeCF>${tipo}</TipoeCF><eNCF>${encf}</eNCF></IdDoc>` +
    `<Emisor><RNCEmisor>131880681</RNCEmisor><RazonSocialEmisor>Salpimentao SRL</RazonSocialEmisor><FechaEmision>18-10-2026</FechaEmision></Emisor>` +
    `<Comprador><RNCComprador>101023122</RNCComprador></Comprador><Totales><MontoTotal>${montoTotal}</MontoTotal></Totales></Encabezado>` +
    `<DetallesItems><Item><NumeroLinea>1</NumeroLinea><NombreItem>Servicio</NombreItem><MontoItem>${montoTotal}</MontoItem></Item></DetallesItems>` +
    `${opts.fechaFirma === false ? "" : "<FechaHoraFirma>18-10-2026 14:05:09</FechaHoraFirma>"}` +
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>QwErTy+/123</SignatureValue></Signature></ECF>`;
}

const slot = (inputName: string) => PRINTED_SLOTS.find((entry) => entry.inputName === inputName)!;

describe("buildPrintedDocument", () => {
  it("builds the PDF, file name and QR of a slot, preferring the stored security code", async () => {
    const outcome = await buildPrintedDocument({
      slot: slot("ECF_31"),
      signedXml: signedEcf("31", "E310000000011", "1180.00"),
      storedSecurityCode: "AbC123",
      environment: "certification",
      parser,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.document).toMatchObject({ fileName: "ECF_31_E310000000011.pdf", encf: "E310000000011", securityCode: "AbC123" });
    expect(outcome.document.qrUrl).toBe(
      "https://ecf.dgii.gov.do/certecf/consultatimbre?rncemisor=131880681&RncComprador=101023122&encf=E310000000011" +
        "&fechaemision=18-10-2026&montototal=1180.00&fechafirma=18-10-2026%2014%3A05%3A09&codigoseguridad=AbC123",
    );
    expect(new TextDecoder().decode(outcome.document.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("derives the security code and uses the FC QR for the consumo slot", async () => {
    const outcome = await buildPrintedDocument({
      slot: slot("ECF_32 Menor_250mil"),
      signedXml: signedEcf("32", "E320000000017", "1180.00"),
      environment: "test",
      parser,
    });
    expect(outcome.ok && outcome.document.qrUrl).toBe(
      "https://fc.dgii.gov.do/testecf/consultatimbrefc?rncemisor=131880681&encf=E320000000017&montototal=1180.00&codigoseguridad=QwErTy",
    );
    expect(outcome.ok && outcome.document.fileName).toBe("ECF_32_Menor_250mil_E320000000017.pdf");
  });

  it("returns Spanish errors for unreadable XML, a slot mismatch and a missing signature date", async () => {
    const base = { environment: "certification" as const, parser };
    await expect(buildPrintedDocument({ ...base, slot: slot("ECF_31"), signedXml: "<RFCE/>" })).resolves.toEqual({ ok: false, message: "No se pudo leer el XML firmado del comprobante." });
    await expect(buildPrintedDocument({ ...base, slot: slot("ECF_32 Mayor_o_Igual_250mil"), signedXml: signedEcf("32", "E320000000017", "1180.00") })).resolves.toEqual({
      ok: false,
      message: "La factura E320000000017 es menor a 250 mil.",
    });
    await expect(buildPrintedDocument({ ...base, slot: slot("ECF_31"), signedXml: signedEcf("31", "E310000000011", "10.00", { fechaFirma: false }) })).resolves.toEqual({
      ok: false,
      message: "El XML firmado no tiene la fecha de emisión o de firma necesaria para el QR.",
    });
  });
});

describe("size helpers", () => {
  it("sums the documents and formats the size", () => {
    const doc = (size: number) => ({ bytes: new Uint8Array(size) }) as PrintedDocument;
    expect(totalBytes([doc(1024), null, doc(2048)])).toBe(3072);
    expect(formatBytes(3072)).toBe("3.0 KB");
    expect(formatBytes(PORTAL_MAX_BYTES + 1)).toBe("10.00 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.50 MB");
  });
});
