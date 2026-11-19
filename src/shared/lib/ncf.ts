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

export const NCF_E_TIPO_OPCIONES = [
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

export const CHECKOUT_ECF_SALE_TYPES = ["E31", "E32", "E44", "E45", "E46"] as const;
export type CheckoutEcfSaleType = (typeof CHECKOUT_ECF_SALE_TYPES)[number];
export const DEFAULT_CHECKOUT_ECF_TYPE: CheckoutEcfSaleType = "E32";

export type NcfBCode = (typeof NCF_B_TIPO_OPCIONES)[number]["codigo"];
export type NcfTypeCode = (typeof NCF_TIPO_OPCIONES)[number]["codigo"];
export type NcfTypeOption = (typeof NCF_TIPO_OPCIONES)[number];
export type NcfETypeOption = (typeof NCF_E_TIPO_OPCIONES)[number];
export type NcfSequenceMap = Record<string, number>;

export interface TenantNcfRow {
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  ncf_secuencias_por_tipo?: NcfSequenceMap | null;
  /** Authorized e-CF ranges `{ E31: { start, end } }` (raw jsonb); enforced for E types. */
  ecf_secuencias_rangos?: unknown;
}

export function parseValidNcfSequence(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 99999999) return null;
  return num;
}

function normalizeCode(tipoCodigo: string | null | undefined): string {
  return (tipoCodigo || "").trim().toUpperCase();
}

export function isNcfBCode(tipoCodigo: string | null | undefined): tipoCodigo is NcfBCode {
  if (!tipoCodigo) return false;
  return NCF_B_TIPO_OPCIONES.some((opcion) => opcion.codigo === tipoCodigo);
}

export function isNcfTypeCode(tipoCodigo: string | null | undefined): tipoCodigo is NcfTypeCode {
  if (!tipoCodigo) return false;
  return NCF_TIPO_OPCIONES.some((opcion) => opcion.codigo === tipoCodigo);
}

export function ncfTypeRequiresClientRnc(tipoCodigo: string | null | undefined): boolean {
  const code = normalizeCode(tipoCodigo);
  return code === "B01" || code === "E31";
}

export const LEGACY_TO_ECF_MAP: Record<string, string> = {
  B01: "E31",
  B02: "E32",
  B14: "E41",
  B15: "E44",
  B16: "E46",
  B17: "E47",
};

export function normalizeNcfTypeForFiscalMode(
  currentType: NcfTypeCode | null | undefined,
  mode: "dgii_ecf" | "internal_receipt" | string
): NcfTypeCode {
  let code = normalizeCode(currentType);
  if (!isNcfTypeCode(code)) {
    code = DEFAULT_CHECKOUT_ECF_TYPE;
  }

  if (mode === "dgii_ecf") {
    if (code.startsWith("B")) {
      const eCode = LEGACY_TO_ECF_MAP[code];
      return isNcfTypeCode(eCode) ? (eCode as NcfTypeCode) : DEFAULT_CHECKOUT_ECF_TYPE;
    }
    return code as NcfTypeCode;
  }
  return code as NcfTypeCode;
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

/** Digits after the type code: B-series NCF uses 8 (11 chars), DGII e-NCF uses 10 (13 chars). */
export function ncfSequenceDigits(tipoCodigo: string): number {
  return normalizeCode(tipoCodigo).startsWith("E") ? 10 : 8;
}

export function construirCadenaNcf(tipoCodigo: string, secuencia: number): string | null {
  const code = normalizeCode(tipoCodigo);
  if (!esCodigoNcfValido(code)) return null;
  const digits = ncfSequenceDigits(code);
  if (!Number.isInteger(secuencia) || secuencia < 1 || secuencia >= 10 ** digits) return null;
  return `${code}${String(secuencia).padStart(digits, "0")}`;
}

export function normalizeNcfSequenceMap(rawMap: unknown): NcfSequenceMap {
  let map = rawMap;
  if (typeof map === "string") {
    try {
      map = JSON.parse(map);
    } catch {
      return {};
    }
  }
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {};
  }

  const normalized: NcfSequenceMap = {};
  for (const [rawCode, rawValue] of Object.entries(map as Record<string, unknown>)) {
    const code = normalizeCode(rawCode);
    const seq = parseValidNcfSequence(rawValue);
    if (esCodigoNcfValido(code) && seq != null) {
      normalized[code] = seq;
    }
  }
  return normalized;
}

export type NcfActiveMap = Record<string, boolean>;

/** Normalizes a per-type active map. Only explicit `false` disables a type. */
export function normalizeNcfActiveMap(raw: unknown): NcfActiveMap {
  let map = raw;
  if (typeof map === "string") {
    try {
      map = JSON.parse(map);
    } catch {
      return {};
    }
  }
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const out: NcfActiveMap = {};
  for (const [rawCode, rawValue] of Object.entries(map as Record<string, unknown>)) {
    const code = normalizeCode(rawCode);
    if (esCodigoNcfValido(code)) {
      out[code] = rawValue !== false;
    }
  }
  return out;
}

/**
 * A comprobante type is active unless it is explicitly disabled (`false`) in the
 * map. Missing keys / empty map = active, so existing tenants keep every type on
 * and the POS behaviour is unchanged until the user turns one off.
 */
export function isNcfTypeActive(activeMap: unknown, tipoCodigo: string | null | undefined): boolean {
  const code = normalizeCode(tipoCodigo);
  if (!esCodigoNcfValido(code)) return false;
  const map = normalizeNcfActiveMap(activeMap);
  return map[code] !== false;
}

export interface GetCheckoutNcfTypeOptionsInput {
  fiscalMode: string;
  activeMap: unknown;
  ecfAuthorizedTypes?: readonly string[] | null;
}

/**
 * Returns available NCF options for checkout.
 * Only returns active e-CF sale types (E31, E32, E44, E45, E46) when fiscalMode is "dgii_ecf".
 * If ecfAuthorizedTypes is a non-null array, only types included in it are returned.
 * Returns empty array for any other fiscal mode (such as "ncf_legacy" or "internal_receipt").
 */
export function getCheckoutNcfTypeOptions(
  input: GetCheckoutNcfTypeOptionsInput
): NcfETypeOption[] {
  if (input.fiscalMode !== "dgii_ecf") {
    return [];
  }

  const allowedSaleTypes = new Set<string>(CHECKOUT_ECF_SALE_TYPES);
  const authorizedSet = Array.isArray(input.ecfAuthorizedTypes)
    ? new Set(input.ecfAuthorizedTypes.map(normalizeCode))
    : null;

  return NCF_E_TIPO_OPCIONES.filter((option) => {
    const code = option.codigo;
    if (!allowedSaleTypes.has(code)) {
      return false;
    }
    if (!isNcfTypeActive(input.activeMap, code)) {
      return false;
    }
    if (authorizedSet !== null && !authorizedSet.has(code)) {
      return false;
    }
    return true;
  });
}

export const CHECKOUT_FISCAL_CREDIT_TYPE = "E31";

/**
 * Selects the default checkout NCF type from the available options.
 * Defaults to "E32" if present in options, otherwise the first option code, or null if empty.
 */
export function pickDefaultCheckoutNcfType(
  options: readonly NcfETypeOption[]
): NcfTypeCode | null {
  if (!options || options.length === 0) return null;
  const hasE32 = options.some((opt) => opt.codigo === DEFAULT_CHECKOUT_ECF_TYPE);
  if (hasE32) return DEFAULT_CHECKOUT_ECF_TYPE;
  return options[0]?.codigo ?? null;
}

/**
 * Selects the checkout NCF type depending on whether fiscal credit is requested.
 * When credit is requested and E31 is available, returns E31; otherwise defaults.
 */
export function pickCheckoutNcfType(
  options: readonly NcfETypeOption[],
  requestsFiscalCredit: boolean
): NcfTypeCode | null {
  if (requestsFiscalCredit && options.some((opt) => opt.codigo === CHECKOUT_FISCAL_CREDIT_TYPE)) {
    return CHECKOUT_FISCAL_CREDIT_TYPE;
  }
  return pickDefaultCheckoutNcfType(options);
}

export function getNcfSequenceForType(
  row: TenantNcfRow,
  tipoCodigo: string | null | undefined
): number | null {
  const code = normalizeCode(tipoCodigo);
  if (!esCodigoNcfValido(code)) return null;

  const map = normalizeNcfSequenceMap(row.ncf_secuencias_por_tipo);
  const mapSeq = parseValidNcfSequence(map[code]);
  if (mapSeq != null) return mapSeq;

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
  const codigo = isNcfTypeCode(requestedCode) ? requestedCode : normalizeCode(row.ncf_tipo_default);
  if (!esCodigoNcfValido(codigo) || !codigo.startsWith("E")) return null;

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
