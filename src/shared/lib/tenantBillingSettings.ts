import { insforgeClient } from "./insforge";
import { isCloudAvailabilityFailure, isDesktopCloudUnavailable, recordCloudFailure, recordCloudSuccess } from "./cloudAvailability";
import { readLocalMirror } from "./localFirst";
import { normalizeFiscalMode, type FiscalMode } from "./fiscalTypes";
import { DEFAULT_NCF_B_CODE, esCodigoNcfValido, type NcfTypeCode } from "./ncf";

export interface TenantBillingSettingsRow {
  fiscal_mode?: string | null;
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  itbis_cobro_por_defecto?: boolean | null;
  propina_cobro_por_defecto?: boolean | null;
  fiscal_mode_fallback?: string | null;
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
}

export interface TenantBillingSettings {
  fiscalMode: FiscalMode;
  ncfFiscalActive: boolean;
  defaultNcfType: NcfTypeCode;
  defaultItbisEnabled: boolean;
  defaultPropinaEnabled?: boolean;
  fiscalModeFallback?: FiscalMode | null;
  ecfEnvironment?: string | null;
  rnc?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  ecfIssuerSucursal?: string | null;
  ecfIssuerMunicipio?: string | null;
  ecfIssuerProvincia?: string | null;
  ecfIssuerActividadEconomica?: string | null;
  ecfIssuerCorreoEmisor?: string | null;
}

const TENANT_BILLING_SETTINGS_SELECT =
  "fiscal_mode, ncf_fiscal_activo, ncf_tipo_default, itbis_cobro_por_defecto, propina_cobro_por_defecto, fiscal_mode_fallback, ecf_environment, rnc, nombre_negocio, direccion, ecf_issuer_sucursal, ecf_issuer_municipio, ecf_issuer_provincia, ecf_issuer_actividad_economica, ecf_issuer_correo_emisor";

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
    fiscalModeFallback: normalizeFiscalMode(row?.fiscal_mode_fallback, false),
    ecfEnvironment: row?.ecf_environment || "certification",
    rnc: row?.rnc,
    nombre: row?.nombre ?? row?.nombre_negocio,
    direccion: row?.direccion,
    ecfIssuerSucursal: row?.ecf_issuer_sucursal,
    ecfIssuerMunicipio: row?.ecf_issuer_municipio,
    ecfIssuerProvincia: row?.ecf_issuer_provincia,
    ecfIssuerActividadEconomica: row?.ecf_issuer_actividad_economica,
    ecfIssuerCorreoEmisor: row?.ecf_issuer_correo_emisor,
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

  let res = await insforgeClient.database
    .from("tenants")
    .select(TENANT_BILLING_SETTINGS_SELECT)
    .eq("id", tenantId)
    .maybeSingle();

  if (res.error) {
    res = await insforgeClient.database
      .from("tenants")
      .select("ncf_fiscal_activo, ncf_tipo_default")
      .eq("id", tenantId)
      .maybeSingle();
  }

  if (res.error || !res.data) {
    if (res.error && isCloudAvailabilityFailure(res.error)) recordCloudFailure();
    return await isDesktopCloudUnavailable()
      ? loadLocalTenantBillingSettings(tenantId)
      : null;
  }
  recordCloudSuccess();
  return normalizeTenantBillingSettings(res.data as TenantBillingSettingsRow);
}
