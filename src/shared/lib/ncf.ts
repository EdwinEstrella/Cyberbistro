/** NCF República Dominicana (DGII): 3 caracteres de tipo + 8 dígitos de secuencia = 11 caracteres. */

export interface TenantNcfRow {
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  ncf_secuencia_siguiente?: number | null;
}

export const NCF_TIPO_OPCIONES: ReadonlyArray<{ codigo: string; descripcion: string }> = [
  { codigo: "B01", descripcion: "B01 — Factura con validez fiscal / ITBIS (consumo)" },
  { codigo: "B02", descripcion: "B02 — Factura de registro único de ingresos" },
  { codigo: "B14", descripcion: "B14 — Comprobante para registro de compras" },
  { codigo: "B15", descripcion: "B15 — Factura de régimen especial" },
  { codigo: "B16", descripcion: "B16 — Comprobante para exportaciones" },
  { codigo: "B17", descripcion: "B17 — Comprobante para pagos al exterior" },
  { codigo: "E31", descripcion: "E31 — Factura de crédito fiscal electrónica" },
  { codigo: "E32", descripcion: "E32 — Factura de consumo electrónica" },
  { codigo: "E33", descripcion: "E33 — Nota de débito electrónica" },
  { codigo: "E34", descripcion: "E34 — Nota de crédito electrónica" },
  { codigo: "E41", descripcion: "E41 — Comprobante de compras electrónico" },
  { codigo: "E43", descripcion: "E43 — Gastos menores electrónico" },
  { codigo: "E44", descripcion: "E44 — Regímenes especiales electrónico" },
  { codigo: "E45", descripcion: "E45 — Gubernamental electrónico" },
  { codigo: "E46", descripcion: "E46 — Exportación electrónico" },
  { codigo: "E47", descripcion: "E47 — Pagos al exterior electrónico" },
];

export function etiquetaTipoNcf(codigo: string): string {
  const c = codigo.trim().toUpperCase();
  const row = NCF_TIPO_OPCIONES.find((o) => o.codigo === c);
  return row?.descripcion ?? `${c} — Comprobante fiscal`;
}

/** Valida prefijo tipo (B/E + 2 dígitos). */
export function esCodigoNcfValido(tipoCodigo: string): boolean {
  return /^[BE][0-9]{2}$/i.test(tipoCodigo.trim());
}

export function construirCadenaNcf(tipoCodigo: string, secuencia: number): string | null {
  const code = tipoCodigo.trim().toUpperCase();
  if (!esCodigoNcfValido(code)) return null;
  if (!Number.isInteger(secuencia) || secuencia < 1 || secuencia > 99999999) return null;
  return `${code}${String(secuencia).padStart(8, "0")}`;
}

/** Campos para insertar en `facturas` según configuración del tenant (sin tocar la BD). */
export function prepareNcfForFacturaInsert(row: TenantNcfRow): {
  ncf: string;
  ncf_tipo: string;
  usedSequence: number;
} | null {
  if (!row.ncf_fiscal_activo) return null;
  const seq = row.ncf_secuencia_siguiente;
  if (seq == null || seq < 1) return null;
  const codigo = (row.ncf_tipo_default || "").trim().toUpperCase();
  const ncf = construirCadenaNcf(codigo, seq);
  if (!ncf) return null;
  return { ncf, ncf_tipo: etiquetaTipoNcf(codigo), usedSequence: seq };
}

/** Construye el payload de factura a partir de la secuencia ya reservada en BD (RPC atómico). */
export function ncfPayloadFromReservedSequence(
  ncfTipoDefault: string | null | undefined,
  seqReserved: number
): { ncf: string; ncf_tipo: string; usedSequence: number } | null {
  const codigo = (ncfTipoDefault || "").trim().toUpperCase();
  const ncf = construirCadenaNcf(codigo, seqReserved);
  if (!ncf) return null;
  return { ncf, ncf_tipo: etiquetaTipoNcf(codigo), usedSequence: seqReserved };
}
