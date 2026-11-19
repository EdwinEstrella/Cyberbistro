import {
  isNcfBCode,
  normalizeNcfActiveMap,
  normalizeNcfSequenceMap,
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

export const DEFAULT_AJUSTES_CONFIG: AjustesConfig = {
  nombre_empresa: "",
  rnc: "",
  logo_url: "",
  logo_size_px: 52,
  logo_offset_x: 0,
  logo_offset_y: 0,
  menu_url: "",
  direccion: "",
  telefono: "",
  currency_code: "DOP",
  itbis_cobro_por_defecto: false,
  itbis_incluido_en_precio: false,
  propina_cobro_por_defecto: false,
  kitchen_enabled: true,
  sin_comprobante_por_defecto: false,
  ncf_fiscal_activo: false,
  fiscal_mode: "internal_receipt",
  ecf_environment: "certification",
  ncf_tipo_default: "E32",
  ncf_secuencias_por_tipo: {},
  ncf_tipos_activos: {},
};

export function mapTenantRowToAjustesConfig(data: any): AjustesConfig {
  const storedMode = data?.fiscal_mode || "internal_receipt";
  const fiscalMode: "internal_receipt" | "dgii_ecf" =
    storedMode === "dgii_ecf" ? "dgii_ecf" : "internal_receipt";
  const defaultType =
    data?.ncf_tipo_default && !isNcfBCode(data.ncf_tipo_default)
      ? data.ncf_tipo_default
      : "E32";
  const ncfSequences = normalizeNcfSequenceMap(data?.ncf_secuencias_por_tipo);

  return {
    nombre_empresa: data?.nombre_negocio ?? "",
    rnc: data?.rnc ?? "",
    logo_url: data?.logo_url ?? "",
    logo_size_px: Math.min(90, Math.max(32, Number(data?.logo_size_px ?? 52))),
    logo_offset_x: Math.min(28, Math.max(-28, Number(data?.logo_offset_x ?? 0))),
    logo_offset_y: Math.min(18, Math.max(-12, Number(data?.logo_offset_y ?? 0))),
    menu_url: data?.menu_url || "",
    direccion: data?.direccion ?? "",
    telefono: data?.telefono ?? "",
    currency_code: (data?.moneda || "DOP") as any,
    itbis_cobro_por_defecto: Boolean(data?.itbis_cobro_por_defecto),
    itbis_incluido_en_precio: Boolean(data?.itbis_incluido_en_precio),
    propina_cobro_por_defecto: Boolean(data?.propina_cobro_por_defecto),
    kitchen_enabled: data?.kitchen_enabled !== false,
    sin_comprobante_por_defecto: Boolean(data?.sin_comprobante_por_defecto),
    ncf_fiscal_activo: fiscalMode === "dgii_ecf",
    fiscal_mode: fiscalMode,
    ecf_environment: data?.ecf_environment || "certification",
    ncf_tipo_default: defaultType,
    ncf_secuencias_por_tipo: ncfSequences,
    ncf_tipos_activos: normalizeNcfActiveMap(data?.ncf_tipos_activos),
  };
}

export function buildAjustesSavePayload({
  config,
  existingTenant,
  now = () => new Date().toISOString(),
}: BuildAjustesPayloadOptions): Record<string, any> {
  const isEcfMode =
    config.fiscal_mode === "dgii_ecf" || existingTenant?.fiscal_mode === "dgii_ecf";

  // Settings updates must never write ncf_secuencias_por_tipo: counters are owned exclusively
  // by cloudix_reserve_ecf and the ActivationPanel; writing a stale snapshot moves them backwards.

  // Preserve existing active flags (B keys untouched), then apply config's non-B toggles.
  // Never take B values from config.
  const existingActive = normalizeNcfActiveMap(existingTenant?.ncf_tipos_activos);
  const nextActiveMap: Record<string, boolean> = { ...existingActive };
  if (config.ncf_tipos_activos) {
    for (const [rawCode, val] of Object.entries(config.ncf_tipos_activos)) {
      const code = rawCode.trim().toUpperCase();
      if (!isNcfBCode(code)) {
        nextActiveMap[code] = Boolean(val);
      }
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
    sin_comprobante_por_defecto: Boolean(config.sin_comprobante_por_defecto),
    fiscal_mode_fallback: "internal_receipt",
    ncf_tipos_activos: nextActiveMap,
    updated_at: now(),
  };

  // Only write fiscal_mode and NCF active/default if not in dgii_ecf mode
  if (!isEcfMode) {
    const safeMode = (config.fiscal_mode as string) === "ncf_legacy" ? "internal_receipt" : config.fiscal_mode;
    payload.fiscal_mode = safeMode;
    payload.ncf_fiscal_activo = false;
    if (config.ncf_tipo_default && !isNcfBCode(config.ncf_tipo_default)) {
      payload.ncf_tipo_default = config.ncf_tipo_default;
    }
  }

  return payload;
}
