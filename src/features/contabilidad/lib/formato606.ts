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

function dateFor606(value: string | null): string {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Una fecha fiscal no es válida.");
  return value.slice(0, 10).replace(/-/g, "");
}

function amount(value: number): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Un monto fiscal no es válido.");
  return number.toFixed(2);
}

function field(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\|/g, "");
}

export function generateFormato606(rncEmisor: string, period: string, records: CompraFiscal606[], format: 'txt' | 'csv' = 'txt'): string {
  const normalizedRnc = rncEmisor.replace(/\D/g, "");
  if (normalizedRnc.length !== 9 && normalizedRnc.length !== 11) throw new Error("El RNC o cédula del emisor no es válido.");
  if (!/^\d{6}$/.test(period)) throw new Error("El período debe usar el formato AAAAMM.");

  const lines = records.map((record) => {
    if (!/^[0-9]{9,11}$/.test(record.rnc_cedula.replace(/\D/g, ""))) throw new Error("El RNC o cédula del proveedor no es válido.");
    if (Math.abs(Number(record.total_facturado) - Number(record.monto_servicios) - Number(record.monto_bienes)) > 0.01) {
      throw new Error("El total fiscal debe coincidir con servicios más bienes.");
    }
    return [
      field(record.rnc_cedula).replace(/\D/g, ""), field(record.tipo_identificacion), field(record.tipo_bien_servicio), field(record.ncf), field(record.ncf_modificado),
      dateFor606(record.fecha_comprobante), dateFor606(record.fecha_pago), amount(record.monto_servicios), amount(record.monto_bienes), amount(record.total_facturado),
      amount(record.itbis_facturado), amount(record.itbis_retenido), amount(record.itbis_proporcionalidad), amount(record.itbis_costo), amount(record.itbis_adelantar),
      amount(record.itbis_percibido), field(record.tipo_retencion_isr), amount(record.retencion_isr), amount(record.isr_percibido), amount(record.impuesto_selectivo),
      amount(record.otros_impuestos), amount(record.propina_legal), field(record.forma_pago),
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
