import { supabase } from "./supabase";
import { isCloudAvailabilityFailure, isDesktopCloudUnavailable, recordCloudFailure, recordCloudSuccess } from "./cloudAvailability";
import { readLocalMirror } from "./localFirst";
import { normalizeFiscalMode, type FiscalMode } from "./fiscalTypes";
import { DEFAULT_NCF_B_CODE, esCodigoNcfValido, normalizeNcfActiveMap, type NcfActiveMap, type NcfTypeCode } from "./ncf";
import { parseStoredBounds } from "./ecfSequenceRanges";

export interface TenantBillingSettingsRow {
  fiscal_mode?: string | null;
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  itbis_cobro_por_defecto?: boolean | null;
  propina_cobro_por_defecto?: boolean | null;
  itbis_incluido_en_precio?: boolean | null;
  sin_comprobante_por_defecto?: boolean | null;
  ecf_environment?: string | null;
  rnc?: string | null;
  nombre?: string | null;
  nombre_negocio?: string | null;
  direccion?: string | null;
  ecf_issuer_sucursal?: string | null;
  ecf_issuer_municipio?: string | null;
  ecf_issuer_provincia?: string | null;
  ecf_issuer_actividad_economica?: string | null;
  ecf_issuer_correo_emisor?: string | null;
  ncf_tipos_activos?: unknown;
  ecf_secuencias_rangos?: unknown;
}

export interface TenantBillingSettings {
  fiscalMode: FiscalMode;
  ncfFiscalActive: boolean;
  defaultNcfType: NcfTypeCode;
  defaultItbisEnabled: boolean;
  defaultPropinaEnabled?: boolean;
  /** Menu prices already include ITBIS (base = price / (1 + rate)). */
  itbisIncluded?: boolean;
  /** "Sin comprobante" checkout switch starts ON for every sale. */
  sinComprobantePorDefecto?: boolean;
  ecfEnvironment?: string | null;
  rnc?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  ecfIssuerSucursal?: string | null;
  ecfIssuerMunicipio?: string | null;
  ecfIssuerProvincia?: string | null;
  ecfIssuerActividadEconomica?: string | null;
  ecfIssuerCorreoEmisor?: string | null;
  ncfTiposActivos?: NcfActiveMap;
  ecfAuthorizedTypes?: string[] | null;
}

const TENANT_BILLING_SETTINGS_SELECT_LEGACY =
  "fiscal_mode, ncf_fiscal_activo, ncf_tipo_default, ncf_tipos_activos, itbis_cobro_por_defecto, propina_cobro_por_defecto, ecf_environment, rnc, nombre_negocio, direccion, ecf_issuer_sucursal, ecf_issuer_municipio, ecf_issuer_provincia, ecf_issuer_actividad_economica, ecf_issuer_correo_emisor, ecf_secuencias_rangos";

const TENANT_BILLING_SETTINGS_SELECT_WITH_ITBIS_INCLUDED = `${TENANT_BILLING_SETTINGS_SELECT_LEGACY}, itbis_incluido_en_precio`;

const TENANT_BILLING_SETTINGS_SELECT = `${TENANT_BILLING_SETTINGS_SELECT_WITH_ITBIS_INCLUDED}, sin_comprobante_por_defecto`;

function parseAuthorizedEcfTypes(raw: unknown): string[] | null {
  if (raw == null) return null;
  let parsed = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return Object.keys(parseStoredBounds(parsed));
}

export function normalizeTenantBillingSettings(
  row: TenantBillingSettingsRow | null | undefined
): TenantBillingSettings {
  const fiscalMode = normalizeFiscalMode(row?.fiscal_mode, row?.ncf_fiscal_activo);

  return {
    fiscalMode,
    ncfFiscalActive: fiscalMode === "ncf_legacy",
    defaultNcfType: row?.ncf_tipo_default && esCodigoNcfValido(row.ncf_tipo_default)
      ? (row.ncf_tipo_default as NcfTypeCode)
      : DEFAULT_NCF_B_CODE,
    defaultItbisEnabled: Boolean(row?.itbis_cobro_por_defecto),
    defaultPropinaEnabled: Boolean(row?.propina_cobro_por_defecto),
    itbisIncluded: Boolean(row?.itbis_incluido_en_precio),
    sinComprobantePorDefecto: Boolean(row?.sin_comprobante_por_defecto),
    ecfEnvironment: row?.ecf_environment || "certification",
    rnc: row?.rnc,
    nombre: row?.nombre ?? row?.nombre_negocio,
    direccion: row?.direccion,
    ecfIssuerSucursal: row?.ecf_issuer_sucursal,
    ecfIssuerMunicipio: row?.ecf_issuer_municipio,
    ecfIssuerProvincia: row?.ecf_issuer_provincia,
    ecfIssuerActividadEconomica: row?.ecf_issuer_actividad_economica,
    ecfIssuerCorreoEmisor: row?.ecf_issuer_correo_emisor,
    ncfTiposActivos: normalizeNcfActiveMap(row?.ncf_tipos_activos),
    ecfAuthorizedTypes: parseAuthorizedEcfTypes(row?.ecf_secuencias_rangos),
  };
}

async function loadLocalTenantBillingSettings(tenantId: string): Promise<TenantBillingSettings | null> {
  try {
    const tenants = await readLocalMirror<TenantBillingSettingsRow & { id?: string }>(tenantId, "tenants");
    const tenant = tenants.find((row) => row.id === tenantId);
    return tenant ? normalizeTenantBillingSettings(tenant) : null;
  } catch {
    return null;
  }
}

export async function loadTenantBillingSettings(
  tenantId: string
): Promise<TenantBillingSettings | null> {
  if (await isDesktopCloudUnavailable()) {
    return loadLocalTenantBillingSettings(tenantId);
  }

  type CloudRes = { data: unknown; error: unknown };
  let res: CloudRes;
  try {
    res = (await supabase
      .from("tenants")
      .select(TENANT_BILLING_SETTINGS_SELECT)
      .eq("id", tenantId)
      .maybeSingle()) as CloudRes;

    if (res.error) {
      // The cloud may not have the newest column yet: retry without it, keeping the older columns.
      res = (await supabase
        .from("tenants")
        .select(TENANT_BILLING_SETTINGS_SELECT_WITH_ITBIS_INCLUDED)
        .eq("id", tenantId)
        .maybeSingle()) as CloudRes;
    }

    if (res.error) {
      res = (await supabase
        .from("tenants")
        .select(TENANT_BILLING_SETTINGS_SELECT_LEGACY)
        .eq("id", tenantId)
        .maybeSingle()) as CloudRes;
    }

    if (res.error) {
      res = (await supabase
        .from("tenants")
        .select("ncf_fiscal_activo, ncf_tipo_default")
        .eq("id", tenantId)
        .maybeSingle()) as CloudRes;
    }
  } catch (error) {
    // Network-level throw (cloud down): degrade to the last-known local tenant row.
    if (isCloudAvailabilityFailure(error)) recordCloudFailure();
    res = { data: null, error };
  }

  if (res.error || !res.data) {
    if (res.error && isCloudAvailabilityFailure(res.error)) recordCloudFailure();
    // Any cloud failure (not only a recognised outage) falls back to the local
    // tenant row. Returns null only when no local tenant data exists (fail closed).
    return loadLocalTenantBillingSettings(tenantId);
  }
  recordCloudSuccess();
  return normalizeTenantBillingSettings(res.data as TenantBillingSettingsRow);
}
