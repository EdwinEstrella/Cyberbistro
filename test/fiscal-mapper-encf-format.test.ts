import { describe, expect, it } from "vitest";
import { createUnsignedEcfXml } from "../worker/fiscal/mapper";
import type { FiscalWorkerSnapshot } from "../worker/fiscal/types";

function snapshotWithNcf(ncf: string): FiscalWorkerSnapshot {
  return {
    invoicePayload: {
      factura: {
        created_at: "2026-10-24T12:00:00.000Z",
        cliente_rnc: "123456789",
        cliente_nombre: "Test",
        ncf,
        subtotal: 100,
        itbis: 18,
        total: 118,
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

describe("e-NCF format guard", () => {
  it("accepts a 13-character DGII e-NCF", () => {
    expect(() => createUnsignedEcfXml(snapshotWithNcf("E310000000001"))).not.toThrow();
  });

  it("rejects an 11-character NCF-style number before it reaches the DGII", () => {
    expect(() => createUnsignedEcfXml(snapshotWithNcf("E3100000001"))).toThrow(/eNCF/);
  });
});
