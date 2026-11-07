import { describe, expect, it } from "vitest";
import { createUnsignedEcfXml } from "../worker/fiscal/mapper";
import type { FiscalWorkerSnapshot } from "../worker/fiscal/types";

const NOW = new Date("2026-10-19T14:30:00.000Z");

function buildSnapshot(paymentMethod: string): FiscalWorkerSnapshot {
  return {
    invoicePayload: {
      factura: {
        created_at: "2026-10-19T10:00:00.000Z",
        ncf: "E320000000010",
        subtotal: 100,
        itbis: 18,
        total: 118,
      },
      tenant: {
        rnc: "133488485",
        nombre_negocio: "SALPIMENTAO RESTAURANT CAFE & GRILL SRL",
        direccion: "AVE. ISABEL AGUIAR NO. 269",
        ecf_issuer_actividad_economica: "5610",
        ecf_issuer_correo_emisor: "x@y.com",
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
        { payment_method: paymentMethod, amount: 118 },
      ],
    },
  } as unknown as FiscalWorkerSnapshot;
}

describe("DGII Payment Methods Mapping", () => {
  it.each([
    { metodo_pago: "efectivo", formaPago: 1, tipoPago: 1, terminoPago: "Al contado" },
    { metodo_pago: "tarjeta", formaPago: 3, tipoPago: 1, terminoPago: "Al contado" },
    { metodo_pago: "transferencia", formaPago: 2, tipoPago: 1, terminoPago: "Al contado" },
    { metodo_pago: "digital", formaPago: 8, tipoPago: 1, terminoPago: "Al contado" },
    { metodo_pago: "fiado", formaPago: 4, tipoPago: 2, terminoPago: "A credito" },
    { metodo_pago: "  Transferencia ", formaPago: 2, tipoPago: 1, terminoPago: "Al contado" },
    { metodo_pago: "cripto", formaPago: 8, tipoPago: 1, terminoPago: "Al contado" },
    { metodo_pago: "constructor", formaPago: 8, tipoPago: 1, terminoPago: "Al contado" },
  ])(
    "maps metodo_pago '$metodo_pago' to FormaPago $formaPago, TipoPago $tipoPago, TerminoPago '$terminoPago'",
    ({ metodo_pago, formaPago, tipoPago, terminoPago }) => {
      const snapshot = buildSnapshot(metodo_pago);
      const xml = createUnsignedEcfXml(snapshot, NOW);

      expect(xml).toContain(`<FormaPago>${formaPago}</FormaPago>`);
      expect(xml).toContain(`<TipoPago>${tipoPago}</TipoPago>`);
      expect(xml).toContain(`<TerminoPago>${terminoPago}</TerminoPago>`);
      expect(xml).toContain("<MontoPago>118.00</MontoPago>");
    }
  );

  it("treats invoices with no payments as credit sales (TipoPago 2, TerminoPago 'A credito', no TablaFormasPago)", () => {
    const snapshot = buildSnapshot("efectivo");
    (snapshot.invoicePayload as any).payments = [];
    const xml = createUnsignedEcfXml(snapshot, NOW);

    expect(xml).toContain("<TipoPago>2</TipoPago>");
    expect(xml).toContain("<TerminoPago>A credito</TerminoPago>");
    expect(xml).not.toContain("<TablaFormasPago>");
    expect(xml).not.toContain("<FormaPago>");
  });
});
