import { formatDgiiAmount, formatDgiiDate, formatDgiiField, normalizeDgiiRnc } from "./dgiiHelpers";

export type CompraFiscal606 = {
  rnc_cedula: string;
  tipo_identificacion: string;
  tipo_bien_servicio: string;
  ncf: string;
  ncf_modificado: string | null;
  fecha_comprobante: string;
  fecha_pago: string | null;
  monto_servicios: number;
  monto_bienes: number;
  total_facturado: number;
  itbis_facturado: number;
  itbis_retenido: number;
  itbis_proporcionalidad: number;
  itbis_costo: number;
  itbis_adelantar: number;
  itbis_percibido: number;
  tipo_retencion_isr: string | null;
  retencion_isr: number;
  isr_percibido: number;
  impuesto_selectivo: number;
  otros_impuestos: number;
  propina_legal: number;
  forma_pago: string;
};

export function filterRecordsWithNcf(records: CompraFiscal606[]): CompraFiscal606[] {
  return records.filter((record) => /^(B|E)/.test(record.ncf.trim().toUpperCase()));
}

export function generateFormato606(rncEmisor: string, period: string, records: CompraFiscal606[], format: 'txt' | 'csv' = 'txt'): string {
  const normalizedRnc = normalizeDgiiRnc(rncEmisor);
  if (normalizedRnc.length !== 9 && normalizedRnc.length !== 11) throw new Error("El RNC o cédula del emisor no es válido.");
  if (!/^\d{6}$/.test(period)) throw new Error("El período debe usar el formato AAAAMM.");

  const lines = records.map((record) => {
    if (!/^[0-9]{9,11}$/.test(record.rnc_cedula.replace(/\D/g, ""))) throw new Error("El RNC o cédula del proveedor no es válido.");
    if (Math.abs(Number(record.total_facturado) - Number(record.monto_servicios) - Number(record.monto_bienes)) > 0.01) {
      throw new Error("El total fiscal debe coincidir con servicios más bienes.");
    }
    return [
      formatDgiiField(record.rnc_cedula).replace(/\D/g, ""),
      formatDgiiField(record.tipo_identificacion),
      formatDgiiField(record.tipo_bien_servicio),
      formatDgiiField(record.ncf),
      formatDgiiField(record.ncf_modificado),
      formatDgiiDate(record.fecha_comprobante),
      formatDgiiDate(record.fecha_pago),
      formatDgiiAmount(record.monto_servicios),
      formatDgiiAmount(record.monto_bienes),
      formatDgiiAmount(record.total_facturado),
      formatDgiiAmount(record.itbis_facturado),
      formatDgiiAmount(record.itbis_retenido),
      formatDgiiAmount(record.itbis_proporcionalidad),
      formatDgiiAmount(record.itbis_costo),
      formatDgiiAmount(record.itbis_adelantar),
      formatDgiiAmount(record.itbis_percibido),
      formatDgiiField(record.tipo_retencion_isr),
      formatDgiiAmount(record.retencion_isr),
      formatDgiiAmount(record.isr_percibido),
      formatDgiiAmount(record.impuesto_selectivo),
      formatDgiiAmount(record.otros_impuestos),
      formatDgiiAmount(record.propina_legal),
      formatDgiiField(record.forma_pago),
    ].join(format === 'csv' ? "," : "|");
  });

  if (format === 'csv') {
    const headers = [
      "RNC/Cédula", "Tipo Id", "Tipo Bien/Servicio", "NCF", "NCF Modificado", "Fecha Comp", "Fecha Pago",
      "Monto Serv", "Monto Bienes", "Total Facturado", "ITBIS Facturado", "ITBIS Retenido", "ITBIS Prop",
      "ITBIS Costo", "ITBIS Adelantar", "ITBIS Percibido", "Tipo Ret ISR", "Ret ISR", "ISR Percibido",
      "ISC", "Otros Imp", "Propina", "Forma Pago"
    ].join(",");
    // Prepend UTF-8 BOM for Excel compatibility
    return "\uFEFF" + [headers, ...lines].join("\r\n");
  }

  return [`606|${normalizedRnc}|${period}|${records.length}`, ...lines].join("\r\n");
}
