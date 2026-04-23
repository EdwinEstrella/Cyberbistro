/** NCF Republica Dominicana (DGII): 3 caracteres de tipo + 8 digitos de secuencia = 11 caracteres. */

export const DEFAULT_NCF_SEQUENCE = 1;

export const NCF_B_TIPO_OPCIONES = [
  { codigo: "B01", descripcion: "B01 - Factura con validez fiscal / ITBIS (consumo)" },
  { codigo: "B02", descripcion: "B02 - Factura de registro unico de ingresos" },
  { codigo: "B14", descripcion: "B14 - Comprobante para registro de compras" },
  { codigo: "B15", descripcion: "B15 - Factura de regimen especial" },
  { codigo: "B16", descripcion: "B16 - Comprobante para exportaciones" },
  { codigo: "B17", descripcion: "B17 - Comprobante para pagos al exterior" },
] as const;

const NCF_E_TIPO_OPCIONES = [
  { codigo: "E31", descripcion: "E31 - Factura de credito fiscal electronica" },
  { codigo: "E32", descripcion: "E32 - Factura de consumo electronica" },
  { codigo: "E33", descripcion: "E33 - Nota de debito electronica" },
  { codigo: "E34", descripcion: "E34 - Nota de credito electronica" },
  { codigo: "E41", descripcion: "E41 - Comprobante de compras electronico" },
  { codigo: "E43", descripcion: "E43 - Gastos menores electronico" },
  { codigo: "E44", descripcion: "E44 - Regimenes especiales electronico" },
  { codigo: "E45", descripcion: "E45 - Gubernamental electronico" },
  { codigo: "E46", descripcion: "E46 - Exportacion electronico" },
  { codigo: "E47", descripcion: "E47 - Pagos al exterior electronico" },
] as const;

export const NCF_TIPO_OPCIONES = [...NCF_B_TIPO_OPCIONES, ...NCF_E_TIPO_OPCIONES] as const;

export type NcfBCode = (typeof NCF_B_TIPO_OPCIONES)[number]["codigo"];
export type NcfTypeCode = (typeof NCF_TIPO_OPCIONES)[number]["codigo"];
export type NcfSequenceMap = Record<string, number>;

export const DEFAULT_NCF_B_CODE: NcfBCode = "B01";
export const NCF_B_SEQUENCE_COLUMN_BY_CODE = {
  B01: "ncf_b01_secuencia_siguiente",
  B02: "ncf_b02_secuencia_siguiente",
  B14: "ncf_b14_secuencia_siguiente",
  B15: "ncf_b15_secuencia_siguiente",
  B16: "ncf_b16_secuencia_siguiente",
  B17: "ncf_b17_secuencia_siguiente",
} as const satisfies Record<NcfBCode, string>;
export const NCF_B_SEQUENCE_FIELDS_SELECT = Object.values(NCF_B_SEQUENCE_COLUMN_BY_CODE).join(", ");

export type NcfBSequenceColumn = (typeof NCF_B_SEQUENCE_COLUMN_BY_CODE)[NcfBCode];

export interface TenantNcfRow {
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  ncf_secuencia_siguiente?: number | null;
  ncf_secuencias_por_tipo?: NcfSequenceMap | null;
  ncf_b01_secuencia_siguiente?: number | null;
  ncf_b02_secuencia_siguiente?: number | null;
  ncf_b14_secuencia_siguiente?: number | null;
  ncf_b15_secuencia_siguiente?: number | null;
  ncf_b16_secuencia_siguiente?: number | null;
  ncf_b17_secuencia_siguiente?: number | null;
}

function parseValidNcfSequence(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 99999999) return null;
  return num;
}

function normalizeCode(tipoCodigo: string | null | undefined): string {
  return (tipoCodigo || "").trim().toUpperCase();
}

export function getNcfSequenceColumnName(tipoCodigo: NcfBCode): NcfBSequenceColumn {
  return NCF_B_SEQUENCE_COLUMN_BY_CODE[tipoCodigo];
}

function getExplicitBSequenceForType(
  row: Partial<TenantNcfRow> | null | undefined,
  tipoCodigo: NcfBCode
): number | null {
  if (!row) return null;
  const columnName = getNcfSequenceColumnName(tipoCodigo) as keyof TenantNcfRow;
  return parseValidNcfSequence(row[columnName]);
}

export function isNcfBCode(tipoCodigo: string | null | undefined): tipoCodigo is NcfBCode {
  return NCF_B_TIPO_OPCIONES.some((opcion) => opcion.codigo === normalizeCode(tipoCodigo));
}

export function etiquetaTipoNcf(codigo: string): string {
  const normalized = normalizeCode(codigo);
  const row = NCF_TIPO_OPCIONES.find((opcion) => opcion.codigo === normalized);
  return row?.descripcion ?? `${normalized} - Comprobante fiscal`;
}

/** Valida prefijo tipo (B/E + 2 digitos). */
export function esCodigoNcfValido(tipoCodigo: string): boolean {
  return /^[BE][0-9]{2}$/i.test(tipoCodigo.trim());
}

export function construirCadenaNcf(tipoCodigo: string, secuencia: number): string | null {
  const code = normalizeCode(tipoCodigo);
  if (!esCodigoNcfValido(code)) return null;
  if (!Number.isInteger(secuencia) || secuencia < 1 || secuencia > 99999999) return null;
  return `${code}${String(secuencia).padStart(8, "0")}`;
}

export function normalizeNcfSequenceMap(rawMap: unknown): NcfSequenceMap {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
    return {};
  }

  const normalized: NcfSequenceMap = {};
  for (const [rawCode, rawValue] of Object.entries(rawMap)) {
    const code = normalizeCode(rawCode);
    const seq = parseValidNcfSequence(rawValue);
    if (esCodigoNcfValido(code) && seq != null) {
      normalized[code] = seq;
    }
  }
  return normalized;
}

export function buildDefaultBSequenceMap(): Record<NcfBCode, number> {
  return {
    B01: DEFAULT_NCF_SEQUENCE,
    B02: DEFAULT_NCF_SEQUENCE,
    B14: DEFAULT_NCF_SEQUENCE,
    B15: DEFAULT_NCF_SEQUENCE,
    B16: DEFAULT_NCF_SEQUENCE,
    B17: DEFAULT_NCF_SEQUENCE,
  };
}

export function buildBSequenceMap(
  rawMap: unknown,
  legacyDefaultType?: string | null,
  legacyNextSequence?: number | null,
  rawColumns?: Partial<TenantNcfRow> | null
): Record<NcfBCode, number> {
  const base = buildDefaultBSequenceMap();
  const normalized = normalizeNcfSequenceMap(rawMap);

  for (const opcion of NCF_B_TIPO_OPCIONES) {
    const explicitSeq = getExplicitBSequenceForType(rawColumns, opcion.codigo);
    if (explicitSeq != null) {
      base[opcion.codigo] = explicitSeq;
      continue;
    }

    const mapSeq = parseValidNcfSequence(normalized[opcion.codigo]);
    if (mapSeq != null) {
      base[opcion.codigo] = mapSeq;
    }
  }

  const legacyCode = normalizeCode(legacyDefaultType);
  const legacySeq = parseValidNcfSequence(legacyNextSequence);
  if (
    isNcfBCode(legacyCode) &&
    legacySeq != null &&
    normalized[legacyCode] == null &&
    getExplicitBSequenceForType(rawColumns, legacyCode) == null
  ) {
    base[legacyCode] = legacySeq;
  }

  return base;
}

export function buildBSequenceMapFromRow(
  row: Partial<TenantNcfRow> | null | undefined
): Record<NcfBCode, number> {
  return buildBSequenceMap(
    row?.ncf_secuencias_por_tipo,
    row?.ncf_tipo_default,
    row?.ncf_secuencia_siguiente,
    row
  );
}

export function buildNcfSequenceMapForSave(
  bSequences: Partial<Record<string, number>>,
  existingRawMap?: unknown
): NcfSequenceMap {
  const existing = normalizeNcfSequenceMap(existingRawMap);
  const nextMap: NcfSequenceMap = { ...existing };

  for (const opcion of NCF_B_TIPO_OPCIONES) {
    const seq = parseValidNcfSequence(bSequences[opcion.codigo]) ?? DEFAULT_NCF_SEQUENCE;
    nextMap[opcion.codigo] = seq;
  }

  return nextMap;
}

export function buildNcfSequenceColumnsForSave(
  bSequences: Partial<Record<string, number>>
): Record<NcfBSequenceColumn, number> {
  const normalized = buildDefaultBSequenceMap();

  for (const opcion of NCF_B_TIPO_OPCIONES) {
    const seq = parseValidNcfSequence(bSequences[opcion.codigo]) ?? DEFAULT_NCF_SEQUENCE;
    normalized[opcion.codigo] = seq;
  }

  return {
    [NCF_B_SEQUENCE_COLUMN_BY_CODE.B01]: normalized.B01,
    [NCF_B_SEQUENCE_COLUMN_BY_CODE.B02]: normalized.B02,
    [NCF_B_SEQUENCE_COLUMN_BY_CODE.B14]: normalized.B14,
    [NCF_B_SEQUENCE_COLUMN_BY_CODE.B15]: normalized.B15,
    [NCF_B_SEQUENCE_COLUMN_BY_CODE.B16]: normalized.B16,
    [NCF_B_SEQUENCE_COLUMN_BY_CODE.B17]: normalized.B17,
  };
}

export function buildTenantNcfUpdatePayload(
  ncfFiscalActivo: boolean,
  ncfTipoDefault: NcfBCode,
  bSequences: Partial<Record<string, number>>,
  existingRawMap?: unknown
): {
  ncf_fiscal_activo: boolean;
  ncf_tipo_default: NcfBCode;
  ncf_secuencia_siguiente: number;
  ncf_secuencias_por_tipo: NcfSequenceMap;
} & Record<NcfBSequenceColumn, number> {
  const nextMap = buildNcfSequenceMapForSave(bSequences, existingRawMap);
  const nextDefaultSequence = nextMap[ncfTipoDefault] ?? DEFAULT_NCF_SEQUENCE;

  return {
    ncf_fiscal_activo: ncfFiscalActivo,
    ncf_tipo_default: ncfTipoDefault,
    ncf_secuencia_siguiente: nextDefaultSequence,
    ncf_secuencias_por_tipo: nextMap,
    ...buildNcfSequenceColumnsForSave(nextMap),
  };
}

export function getNcfSequenceForType(
  row: TenantNcfRow,
  tipoCodigo: string | null | undefined
): number | null {
  const code = normalizeCode(tipoCodigo);
  if (!esCodigoNcfValido(code)) return null;

  if (isNcfBCode(code)) {
    const explicitSeq = getExplicitBSequenceForType(row, code);
    if (explicitSeq != null) return explicitSeq;
  }

  const map = normalizeNcfSequenceMap(row.ncf_secuencias_por_tipo);
  const mapSeq = parseValidNcfSequence(map[code]);
  if (mapSeq != null) return mapSeq;

  const legacyCode = normalizeCode(row.ncf_tipo_default);
  const legacySeq = parseValidNcfSequence(row.ncf_secuencia_siguiente);
  if (legacyCode === code && legacySeq != null) {
    return legacySeq;
  }

  return null;
}

/** Campos para insertar en `facturas` segun configuracion del tenant (sin tocar la BD). */
export function prepareNcfForFacturaInsert(row: TenantNcfRow): {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
} | null;
export function prepareNcfForFacturaInsert(
  row: TenantNcfRow,
  preferredType: string | null | undefined
): {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
} | null;
export function prepareNcfForFacturaInsert(
  row: TenantNcfRow,
  preferredType?: string | null
): {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
} | null {
  if (!row.ncf_fiscal_activo) return null;

  const requestedCode = normalizeCode(preferredType);
  const codigo = isNcfBCode(requestedCode) ? requestedCode : normalizeCode(row.ncf_tipo_default);
  if (!esCodigoNcfValido(codigo)) return null;

  const seq = getNcfSequenceForType(row, codigo);
  if (seq == null) return null;

  const ncf = construirCadenaNcf(codigo, seq);
  if (!ncf) return null;

  return {
    ncf,
    ncf_tipo: etiquetaTipoNcf(codigo),
    tipoCodigo: codigo,
    usedSequence: seq,
  };
}

/** Construye el payload de factura a partir de la secuencia ya reservada en BD (RPC atomico). */
export function ncfPayloadFromReservedSequence(
  ncfTipoCodigo: string | null | undefined,
  seqReserved: number
): { ncf: string; ncf_tipo: string; tipoCodigo: string; usedSequence: number } | null {
  const codigo = normalizeCode(ncfTipoCodigo);
  const ncf = construirCadenaNcf(codigo, seqReserved);
  if (!ncf) return null;
  return {
    ncf,
    ncf_tipo: etiquetaTipoNcf(codigo),
    tipoCodigo: codigo,
    usedSequence: seqReserved,
  };
}
