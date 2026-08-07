import { describe, expect, it } from "vitest";
import { generateFormato606 } from "./formato606";

describe("generateFormato606", () => {
  it("generates the official header and 23 detail fields", () => {
    const text = generateFormato606("131123456", "202608", [{
      rnc_cedula: "101123456", tipo_identificacion: "1", tipo_bien_servicio: "09", ncf: "B0100000123", ncf_modificado: null,
      fecha_comprobante: "2026-08-03", fecha_pago: "2026-08-10", monto_servicios: 0, monto_bienes: 10000, total_facturado: 10000,
      itbis_facturado: 1800, itbis_retenido: 0, itbis_proporcionalidad: 0, itbis_costo: 0, itbis_adelantar: 1800, itbis_percibido: 0,
      tipo_retencion_isr: null, retencion_isr: 0, isr_percibido: 0, impuesto_selectivo: 0, otros_impuestos: 0, propina_legal: 0, forma_pago: "01",
    }]);
    const [header, detail] = text.split("\r\n");
    expect(header).toBe("606|131123456|202608|1");
    expect(detail.split("|")).toHaveLength(23);
  });
});
