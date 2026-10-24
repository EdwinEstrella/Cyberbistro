import { describe, expect, it } from "vitest";
import { createUnsignedEcfXml, isItbisIncludedInvoice, splitInclusiveLines } from "../worker/fiscal/mapper";
import type { FiscalWorkerSnapshot } from "../worker/fiscal/types";

const cents = (value: number) => Math.round(value * 100);

function snapshotWith(factura: Record<string, unknown>, items: unknown[]): FiscalWorkerSnapshot {
  return {
    invoicePayload: {
      factura: { created_at: "2026-06-10T12:00:00.000Z", cliente_rnc: "123456789", cliente_nombre: "Test", ncf: "E310000000001", ...factura },
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
      items,
      payments: [],
    },
  } as unknown as FiscalWorkerSnapshot;
}

function numbersIn(xml: string, tag: string): number[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, "g"))].map((m) => Number(m[1]));
}

describe("ITBIS-included e-CF mapping", () => {
  // Menu prices 100 + 2 x 50.50 = 201 gross => base 170.34, itbis 30.66 (header rounded once).
  const items = [
    { plato_id: 1, nombre: "A", cantidad: 1, precio_unitario: 100, subtotal: 100 },
    { plato_id: 2, nombre: "B", cantidad: 2, precio_unitario: 50.5, subtotal: 101 },
  ];
  const header = { subtotal: 170.34, itbis: 30.66, total: 201 };

  it("detects inclusive invoices and leaves exclusive ones alone", () => {
    expect(isItbisIncludedInvoice([100, 101], 170.34, 30.66)).toBe(true);
    expect(isItbisIncludedInvoice([100, 50], 150, 27)).toBe(false);
    expect(isItbisIncludedInvoice([100], 100, 0)).toBe(false);
  });

  it("splits lines so bases and ITBIS add up exactly to the header", () => {
    const lines = splitInclusiveLines([100, 101], 0.18, 170.34, 30.66);
    expect(cents(lines.reduce((s, l) => s + l.base, 0))).toBe(cents(170.34));
    expect(cents(lines.reduce((s, l) => s + l.itbis, 0))).toBe(cents(30.66));
    expect(lines[0]).toEqual({ base: 84.75, itbis: 15.25 });
  });

  it("emits lines that sum to MontoGravadoTotal and TotalITBIS", () => {
    const xml = createUnsignedEcfXml(snapshotWith(header, items), new Date("2026-06-10T12:00:00.000Z"));
    const montoItems = numbersIn(xml, "MontoItem");
    const lineItbis = numbersIn(xml, "MontoImpuesto");
    expect(cents(montoItems.reduce((s, v) => s + v, 0))).toBe(cents(numbersIn(xml, "MontoGravadoTotal")[0]));
    expect(cents(lineItbis.reduce((s, v) => s + v, 0))).toBe(cents(numbersIn(xml, "TotalITBIS")[0]));
    expect(numbersIn(xml, "PrecioUnitarioItem")[0]).toBe(84.75);
  });

  it("keeps the exclusive path unchanged", () => {
    const exclusiveItems = [{ plato_id: 1, nombre: "A", cantidad: 1, precio_unitario: 100, subtotal: 100 }];
    const xml = createUnsignedEcfXml(snapshotWith({ subtotal: 100, itbis: 18, total: 118 }, exclusiveItems), new Date("2026-06-10T12:00:00.000Z"));
    expect(numbersIn(xml, "PrecioUnitarioItem")[0]).toBe(100);
    expect(numbersIn(xml, "MontoImpuesto")[0]).toBe(18);
    expect(numbersIn(xml, "MontoItem")[0]).toBe(118);
  });
});
