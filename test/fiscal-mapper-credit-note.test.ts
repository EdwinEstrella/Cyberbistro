import { describe, expect, it } from "vitest";
import { createUnsignedEcfXml } from "../worker/fiscal/mapper";
import type { FiscalWorkerSnapshot } from "../worker/fiscal/types";

function snapshot(factura: Record<string, unknown>): FiscalWorkerSnapshot {
  return {
    invoicePayload: {
      factura: {
        created_at: "2026-10-24T12:00:00.000Z",
        cliente_rnc: "123456789",
        cliente_nombre: "Test",
        ncf: "E340000000001",
        subtotal: 100,
        itbis: 18,
        total: 118,
        ref_ncf: "E310000000007",
        ref_fecha_emision: "2026-10-10",
        ref_codigo_modificacion: 1,
        ref_razon_modificacion: "  Anulacion total  ",
        ...factura,
      },
      tenant: {
        rnc: "130862346",
        nombre_negocio: "CYBERBISTRO SRL",
        direccion: "Av. Winston Churchill",
        ecf_issuer_sucursal: "Principal",
        ecf_issuer_municipio: "Santo Domingo Centro",
        ecf_issuer_provincia: "Distrito Nacional",
        ecf_issuer_actividad_economica: "6201",
        ecf_issuer_correo_emisor: "factura@cyberbistro.app",
      },
      items: [{ plato_id: 1, nombre: "A", cantidad: 1, precio_unitario: 100, subtotal: 100 }],
      payments: [],
    },
  } as unknown as FiscalWorkerSnapshot;
}

const NOW = new Date("2026-10-24T16:00:00.000Z");

describe("E34 credit note XML", () => {
  it("emits InformacionReferencia with a dd-MM-yyyy date, after the items and before the signature date", () => {
    const xml = createUnsignedEcfXml(snapshot({}), NOW);
    expect(xml).toContain("<NCFModificado>E310000000007</NCFModificado>");
    expect(xml).toContain("<FechaNCFModificado>10-10-2026</FechaNCFModificado>");
    expect(xml).toContain("<CodigoModificacion>1</CodigoModificacion>");
    expect(xml).toContain("<RazonModificacion>Anulacion total</RazonModificacion>");
    expect(xml.indexOf("</DetallesItems>")).toBeLessThan(xml.indexOf("<InformacionReferencia>"));
    expect(xml.indexOf("</InformacionReferencia>")).toBeLessThan(xml.indexOf("<FechaHoraFirma>"));
    expect(xml.indexOf("<NCFModificado>")).toBeLessThan(xml.indexOf("<FechaNCFModificado>"));
    expect(xml.indexOf("<FechaNCFModificado>")).toBeLessThan(xml.indexOf("<CodigoModificacion>"));
    expect(xml.indexOf("<CodigoModificacion>")).toBeLessThan(xml.indexOf("<RazonModificacion>"));
  });

  it("places IndicadorNotaCredito right after eNCF", () => {
    const xml = createUnsignedEcfXml(snapshot({}), NOW);
    expect(xml).toMatch(/<eNCF>E340000000001<\/eNCF>\s*<IndicadorNotaCredito>0<\/IndicadorNotaCredito>\s*<IndicadorMontoGravado>/);
  });

  it("sets IndicadorNotaCredito 0 within 30 days and 1 beyond", () => {
    const within = createUnsignedEcfXml(snapshot({ ref_fecha_emision: "2026-09-24" }), NOW); // 30 days
    expect(within).toContain("<IndicadorNotaCredito>0</IndicadorNotaCredito>");
    const beyond = createUnsignedEcfXml(snapshot({ ref_fecha_emision: "2026-09-23" }), NOW); // 31 days
    expect(beyond).toContain("<IndicadorNotaCredito>1</IndicadorNotaCredito>");
  });

  it("caps the reason at 90 characters", () => {
    const xml = createUnsignedEcfXml(snapshot({ ref_razon_modificacion: "x".repeat(120) }), NOW);
    expect(xml).toContain(`<RazonModificacion>${"x".repeat(90)}</RazonModificacion>`);
  });

  it("omits RazonModificacion when no reason is given", () => {
    const xml = createUnsignedEcfXml(snapshot({ ref_razon_modificacion: "  " }), NOW);
    expect(xml).not.toContain("RazonModificacion");
  });

  it.each([
    ["ref_ncf", { ref_ncf: null }],
    ["ref_fecha_emision", { ref_fecha_emision: null }],
    ["ref_codigo_modificacion", { ref_codigo_modificacion: null }],
    ["a non-E31/E32 ref_ncf", { ref_ncf: "E410000000001" }],
    ["a short ref_ncf", { ref_ncf: "E3100000007" }],
    ["an invalid ref date", { ref_fecha_emision: "not-a-date" }],
  ])("fails closed when %s is invalid", (_label, patch) => {
    expect(() => createUnsignedEcfXml(snapshot(patch), NOW)).toThrow(/credit note|E34/i);
  });

  it("leaves non-E34 invoices without reference or credit-note indicator", () => {
    const xml = createUnsignedEcfXml(snapshot({ ncf: "E310000000001" }), NOW);
    expect(xml).not.toContain("InformacionReferencia");
    expect(xml).not.toContain("IndicadorNotaCredito");
  });
});
