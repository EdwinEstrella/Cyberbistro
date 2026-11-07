import { describe, expect, it } from "vitest";
import { createUnsignedEcfXml } from "../worker/fiscal/mapper";
import type { FiscalWorkerSnapshot } from "../worker/fiscal/types";

function extractChildTags(xml: string, parentTag: string): string[] {
  const match = new RegExp(`<${parentTag}>([\\s\\S]*?)<\\/${parentTag}>`).exec(xml);
  if (!match) return [];
  const inner = match[1];
  const tags: string[] = [];
  const tagRegex = /<([A-Za-z0-9_]+)>/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(inner)) !== null) {
    tags.push(tagMatch[1]);
  }
  return tags;
}

const NOW = new Date("2026-10-19T14:30:00.000Z");

describe("DGII Accepted XML Shape Parity", () => {
  it("builds an E34 credit note matching the DGII accepted shape", () => {
    const snapshot: FiscalWorkerSnapshot = {
      ecf_secuencias_rangos: {
        E34: { start: 1, end: 100, vence: "31-12-2027" },
      },
      invoicePayload: {
        factura: {
          created_at: "2026-10-19T10:00:00.000Z",
          ncf: "E340000000024",
          subtotal: 100,
          itbis: 18,
          total: 118,
          ref_ncf: "E320000000005",
          ref_fecha_emision: "2026-10-19",
          ref_codigo_modificacion: 2,
          ref_razon_modificacion: "Error en datos",
          // No buyer RNC (consumidor final)
        },
        tenant: {
          rnc: "133488485",
          nombre_negocio: "SALPIMENTAO RESTAURANT CAFE & GRILL SRL",
          direccion: "AVE. ISABEL AGUIAR NO. 269",
          ecf_issuer_sucursal: "SALPIMENTAO RESTAURANT CAFE & GRILL SRL", // sucursal = business name
          ecf_issuer_municipio: "Mao", // name, not 6-digit code
          ecf_issuer_provincia: "VALVERDE", // name, not 6-digit code
          ecf_issuer_actividad_economica: "5610",
          ecf_issuer_correo_emisor: "x@y.com",
          telefono: "809-472-7676",
        },
        items: [
          {
            plato_id: 1,
            nombre: "TOP BOWL 1",
            cantidad: 15,
            unidad_medida: "31",
            precio_unitario: 6.67,
            subtotal: 100,
            itbis: 18,
          },
        ],
        payments: [
          { payment_method: "efectivo", amount: 118 },
        ],
      },
    } as unknown as FiscalWorkerSnapshot;

    const xml = createUnsignedEcfXml(snapshot, NOW);

    // 1. Root is exactly <ECF> with no xmlns
    expect(xml).toMatch(/^<\?xml[^>]*\?>\s*<ECF>/);
    expect(xml).not.toMatch(/<ECF\s+[^>]*xmlns/);
    expect(xml).not.toContain("xmlns=");

    // 2. E34 IdDoc children are exactly [TipoeCF, eNCF, IndicadorNotaCredito, IndicadorMontoGravado, TipoIngresos, TipoPago]
    const idDocChildren = extractChildTags(xml, "IdDoc");
    expect(idDocChildren).toEqual([
      "TipoeCF",
      "eNCF",
      "IndicadorNotaCredito",
      "IndicadorMontoGravado",
      "TipoIngresos",
      "TipoPago",
    ]);
    expect(xml).not.toContain("<FechaLimitePago>");
    expect(xml).not.toContain("<TerminoPago>");
    expect(xml).not.toContain("<TablaFormasPago>");

    // 3. No Municipio / Provincia when configured as names (only 6-digit codes allowed)
    expect(xml).not.toContain("<Municipio>");
    expect(xml).not.toContain("<Provincia>");
    expect(xml).not.toContain("Mao");
    expect(xml).not.toContain("VALVERDE");

    // 4. No Sucursal duplicate when it matches the business name
    expect(xml).not.toContain("<Sucursal>");

    // 5. Item children order with IndicadorBienoServicio and without TablaCodigosItem
    expect(xml).not.toContain("<TablaCodigosItem>");
    expect(xml).not.toContain("<CodigosItem>");
    const itemChildren = extractChildTags(xml, "Item");
    expect(itemChildren).toEqual([
      "NumeroLinea",
      "IndicadorFacturacion",
      "NombreItem",
      "IndicadorBienoServicio",
      "CantidadItem",
      "UnidadMedida",
      "PrecioUnitarioItem",
      "MontoItem",
    ]);
    expect(xml).toContain("<IndicadorBienoServicio>1</IndicadorBienoServicio>");

    // 6. Comprador for consumidor final with no buyer RNC is omitted entirely (no RNCComprador 000000000)
    expect(xml).not.toContain("<RNCComprador>000000000</RNCComprador>");
    expect(xml).not.toContain("<RNCComprador>");
    expect(xml).not.toContain("<Comprador>");

    // 7. Exactly one FechaHoraFirma in the unsigned XML
    const firmaCount = (xml.match(/<FechaHoraFirma>/g) || []).length;
    expect(firmaCount).toBe(1);
  });

  it("builds an E31 with buyer RNC, 6-digit municipio/provincia, and distinct sucursal", () => {
    const snapshot: FiscalWorkerSnapshot = {
      ecf_secuencias_rangos: {
        E31: { start: 1, end: 100, vence: "31-12-2027" },
      },
      invoicePayload: {
        factura: {
          created_at: "2026-10-19T10:00:00.000Z",
          ncf: "E310000000023",
          cliente_rnc: "131880681",
          cliente_nombre: "DOCUMENTOS ELECTRONICOS DE 03",
          subtotal: 100,
          itbis: 18,
          total: 118,
        },
        tenant: {
          rnc: "133488485",
          nombre_negocio: "SALPIMENTAO RESTAURANT CAFE & GRILL SRL",
          direccion: "AVE. ISABEL AGUIAR NO. 269",
          ecf_issuer_sucursal: "Sucursal Principal",
          ecf_issuer_municipio: "270100",
          ecf_issuer_provincia: "270000",
          ecf_issuer_actividad_economica: "5610",
          ecf_issuer_correo_emisor: "x@y.com",
          telefono: "809-472-7676",
        },
        items: [
          {
            plato_id: 1,
            nombre: "TOP BOWL 1",
            cantidad: 1,
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
        ],
        payments: [
          { payment_method: "efectivo", amount: 118 },
        ],
      },
    } as unknown as FiscalWorkerSnapshot;

    const xml = createUnsignedEcfXml(snapshot, NOW);

    // Root is plain <ECF>
    expect(xml).toMatch(/^<\?xml[^>]*\?>\s*<ECF>/);
    expect(xml).not.toContain("xmlns=");

    // E31 IdDoc keeps payment details and FechaVencimientoSecuencia
    expect(xml).toContain("<FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>");
    expect(xml).toContain("<FechaLimitePago>");
    expect(xml).toContain("<TerminoPago>Al contado</TerminoPago>");
    expect(xml).toContain("<TablaFormasPago>");

    // 6-digit Municipio and Provincia are emitted
    expect(xml).toContain("<Municipio>270100</Municipio>");
    expect(xml).toContain("<Provincia>270000</Provincia>");

    // Sucursal is emitted because it differs from business name
    expect(xml).toContain("<Sucursal>Sucursal Principal</Sucursal>");

    // Buyer RNC is present for E31
    expect(xml).toContain("<Comprador>");
    expect(xml).toContain("<RNCComprador>131880681</RNCComprador>");
    expect(xml).toContain("<RazonSocialComprador>DOCUMENTOS ELECTRONICOS DE 03</RazonSocialComprador>");

    // Item without unidad_medida omits UnidadMedida
    const itemChildren = extractChildTags(xml, "Item");
    expect(itemChildren).toEqual([
      "NumeroLinea",
      "IndicadorFacturacion",
      "NombreItem",
      "IndicadorBienoServicio",
      "CantidadItem",
      "PrecioUnitarioItem",
      "MontoItem",
    ]);

    // Single FechaHoraFirma
    const firmaCount = (xml.match(/<FechaHoraFirma>/g) || []).length;
    expect(firmaCount).toBe(1);
  });

  it("omits UnidadMedida for 'porcion' and missing units, and emits only valid numeric DGII codes like '31'", () => {
    const snapshot: FiscalWorkerSnapshot = {
      ecf_secuencias_rangos: {
        E31: { start: 1, end: 100, vence: "31-12-2027" },
      },
      invoicePayload: {
        factura: {
          created_at: "2026-10-19T10:00:00.000Z",
          ncf: "E310000000001",
          cliente_rnc: "131880681",
          cliente_nombre: "TEST CLIENT",
          subtotal: 300,
          itbis: 54,
          total: 354,
        },
        tenant: {
          rnc: "133488485",
          nombre_negocio: "TEST TENANT",
          direccion: "AVE. ISABEL AGUIAR NO. 269",
          ecf_issuer_actividad_economica: "5610",
          ecf_issuer_correo_emisor: "x@y.com",
        },
        items: [
          {
            plato_id: 1,
            nombre: "Item with textual unit",
            cantidad: 1,
            unidad_medida: "porcion",
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
          {
            plato_id: 2,
            nombre: "Item with missing unit",
            cantidad: 1,
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
          {
            plato_id: 3,
            nombre: "Item with numeric unit code",
            cantidad: 1,
            unidad_medida: "31",
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
        ],
        payments: [
          { payment_method: "efectivo", amount: 354 },
        ],
      },
    } as unknown as FiscalWorkerSnapshot;

    const xml = createUnsignedEcfXml(snapshot, NOW);
    const itemMatches = xml.match(/<Item>[\s\S]*?<\/Item>/g) || [];
    expect(itemMatches).toHaveLength(3);

    // Item 1: 'porcion' is not a 1-2 digit DGII code and must be omitted
    expect(itemMatches[0]).not.toContain("<UnidadMedida>");
    expect(itemMatches[0]).not.toContain("porcion");

    // Item 2: missing unit must be omitted
    expect(itemMatches[1]).not.toContain("<UnidadMedida>");

    // Item 3: '31' matches /^\d{1,2}$/ and is emitted
    expect(itemMatches[2]).toContain("<UnidadMedida>31</UnidadMedida>");
  });

  it("normalizes IndicadorBienoServicio: keeps 2, maps 'abc' and 7 to 1", () => {
    const snapshot: FiscalWorkerSnapshot = {
      ecf_secuencias_rangos: {
        E31: { start: 1, end: 100, vence: "31-12-2027" },
      },
      invoicePayload: {
        factura: {
          created_at: "2026-10-19T10:00:00.000Z",
          ncf: "E310000000001",
          cliente_rnc: "131880681",
          cliente_nombre: "TEST CLIENT",
          subtotal: 300,
          itbis: 54,
          total: 354,
        },
        tenant: {
          rnc: "133488485",
          nombre_negocio: "TEST TENANT",
          direccion: "AVE. ISABEL AGUIAR NO. 269",
          ecf_issuer_actividad_economica: "5610",
          ecf_issuer_correo_emisor: "x@y.com",
        },
        items: [
          {
            plato_id: 1,
            nombre: "Service item",
            cantidad: 1,
            indicador_bien_o_servicio: 2,
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
          {
            plato_id: 2,
            nombre: "Invalid string indicator",
            cantidad: 1,
            indicador_bien_o_servicio: "abc",
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
          {
            plato_id: 3,
            nombre: "Invalid number indicator",
            cantidad: 1,
            indicador_bien_o_servicio: 7,
            precio_unitario: 100,
            subtotal: 100,
            itbis: 18,
          },
        ],
        payments: [
          { payment_method: "efectivo", amount: 354 },
        ],
      },
    } as unknown as FiscalWorkerSnapshot;

    const xml = createUnsignedEcfXml(snapshot, NOW);
    const itemMatches = xml.match(/<Item>[\s\S]*?<\/Item>/g) || [];
    expect(itemMatches).toHaveLength(3);

    // 2 is preserved
    expect(itemMatches[0]).toContain("<IndicadorBienoServicio>2</IndicadorBienoServicio>");
    // 'abc' defaults to 1
    expect(itemMatches[1]).toContain("<IndicadorBienoServicio>1</IndicadorBienoServicio>");
    // 7 defaults to 1
    expect(itemMatches[2]).toContain("<IndicadorBienoServicio>1</IndicadorBienoServicio>");
  });
});
