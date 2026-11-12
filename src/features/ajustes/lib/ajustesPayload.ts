import {
  DEFAULT_NCF_B_CODE,
  DEFAULT_NCF_SEQUENCE,
  isNcfBCode,
  NCF_B_SEQUENCE_COLUMN_BY_CODE,
  NCF_B_TIPO_OPCIONES,
  normalizeNcfActiveMap,
  normalizeNcfSequenceMap,
  parseValidNcfSequence,
  type NcfBCode,
  type NcfBSequenceColumn,
  type NcfSequenceMap,
} from "../../../shared/lib/ncf";
import type { AjustesConfig } from "../types";

export interface BuildAjustesPayloadOptions {
  config: AjustesConfig;
  existingTenant?: {
    fiscal_mode?: string | null;
    ncf_secuencias_por_tipo?: Record<string, number> | null;
    ncf_tipos_activos?: Record<string, boolean> | null;
  } | null;
  now?: () => string;
}

export function buildAjustesSavePayload({
  config,
  existingTenant,
  now = () => new Date().toISOString(),
}: BuildAjustesPayloadOptions): Record<string, any> {
  const isEcfMode =
    config.fiscal_mode === "dgii_ecf" || existingTenant?.fiscal_mode === "dgii_ecf";

  // Build merged ncf_secuencias_por_tipo:
  // Preserve any existing non-B (e-CF) sequences from existing tenant,
  // but ONLY update B-series from config. Ignore any E-codes in config.
  const existingMap = normalizeNcfSequenceMap(existingTenant?.ncf_secuencias_por_tipo);
  const nextSequencesMap: NcfSequenceMap = {};

  for (const [code, val] of Object.entries(existingMap)) {
    if (!isNcfBCode(code)) {
      nextSequencesMap[code] = val;
    }
  }

  // Build B sequence columns and update B sequences in nextSequencesMap in a single pass
  const bColumns = {} as Record<NcfBSequenceColumn, number>;
  for (const opcion of NCF_B_TIPO_OPCIONES) {
    const seq =
      parseValidNcfSequence(config.ncf_secuencias_por_tipo?.[opcion.codigo]) ??
      DEFAULT_NCF_SEQUENCE;
    nextSequencesMap[opcion.codigo] = seq;
    bColumns[NCF_B_SEQUENCE_COLUMN_BY_CODE[opcion.codigo]] = seq;
  }

  // Preserve existing non-B active flags from existing tenant, apply B flags from config
  const existingActive = normalizeNcfActiveMap(existingTenant?.ncf_tipos_activos);
  const nextActiveMap: Record<string, boolean> = {};
  for (const [code, val] of Object.entries(existingActive)) {
    if (!isNcfBCode(code)) {
      nextActiveMap[code] = val;
    }
  }
  for (const opcion of NCF_B_TIPO_OPCIONES) {
    if (config.ncf_tipos_activos?.[opcion.codigo] !== undefined) {
      nextActiveMap[opcion.codigo] = Boolean(config.ncf_tipos_activos[opcion.codigo]);
    }
  }

  const payload: Record<string, any> = {
    nombre_negocio: config.nombre_empresa?.trim() || "",
    rnc: config.rnc?.trim() || null,
    logo_url: config.logo_url?.trim() || null,
    logo_size_px: Math.min(90, Math.max(32, Math.round(Number(config.logo_size_px) || 52))),
    logo_offset_x: Math.min(28, Math.max(-28, Math.round(Number(config.logo_offset_x) || 0))),
    logo_offset_y: Math.min(18, Math.max(-12, Math.round(Number(config.logo_offset_y) || 0))),
    menu_url: config.menu_url?.trim() || null,
    direccion: config.direccion?.trim() || null,
    telefono: config.telefono?.trim() || null,
    moneda: config.currency_code,
    itbis_cobro_por_defecto: Boolean(config.itbis_cobro_por_defecto),
    itbis_incluido_en_precio: Boolean(config.itbis_incluido_en_precio),
    propina_cobro_por_defecto: Boolean(config.propina_cobro_por_defecto),
    kitchen_enabled: config.kitchen_enabled !== false,
    fiscal_mode_fallback: config.fiscal_mode_fallback,
    ...bColumns,
    ncf_secuencias_por_tipo: nextSequencesMap,
    ncf_tipos_activos: nextActiveMap,
    updated_at: now(),
  };

  // Only write fiscal_mode and NCF active/default if not in dgii_ecf mode
  if (!isEcfMode) {
    payload.fiscal_mode = config.fiscal_mode;
    payload.ncf_fiscal_activo = config.fiscal_mode === "ncf_legacy";
    const defaultType: NcfBCode = isNcfBCode(config.ncf_tipo_default)
      ? config.ncf_tipo_default
      : DEFAULT_NCF_B_CODE;
    payload.ncf_tipo_default = defaultType;
    payload.ncf_secuencia_siguiente = nextSequencesMap[defaultType] ?? DEFAULT_NCF_SEQUENCE;
  }

  return payload;
}
