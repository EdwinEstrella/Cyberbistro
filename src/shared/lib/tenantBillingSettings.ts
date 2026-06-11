import { insforgeClient } from "./insforge";
import { isCloudAvailabilityFailure, isDesktopCloudUnavailable, recordCloudFailure, recordCloudSuccess } from "./cloudAvailability";
import { readLocalMirror } from "./localFirst";
import { normalizeFiscalMode, type FiscalMode } from "./fiscalTypes";
import { DEFAULT_NCF_B_CODE, isNcfBCode, type NcfBCode } from "./ncf";

export interface TenantBillingSettingsRow {
  fiscal_mode?: string | null;
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  itbis_cobro_por_defecto?: boolean | null;
  fiscal_mode_fallback?: string | null;
  ecf_environment?: string | null;
}

export interface TenantBillingSettings {
  fiscalMode: FiscalMode;
  ncfFiscalActive: boolean;
  defaultNcfType: NcfBCode;
  defaultItbisEnabled: boolean;
  fiscalModeFallback?: FiscalMode | null;
  ecfEnvironment?: string | null;
}

const TENANT_BILLING_SETTINGS_SELECT =
  "fiscal_mode, ncf_fiscal_activo, ncf_tipo_default, itbis_cobro_por_defecto, fiscal_mode_fallback, ecf_environment";

export function normalizeTenantBillingSettings(
  row: TenantBillingSettingsRow | null | undefined
): TenantBillingSettings {
  const fiscalMode = normalizeFiscalMode(row?.fiscal_mode, row?.ncf_fiscal_activo);

  return {
    fiscalMode,
    ncfFiscalActive: fiscalMode === "ncf_legacy",
    defaultNcfType: isNcfBCode(row?.ncf_tipo_default)
      ? row.ncf_tipo_default
      : DEFAULT_NCF_B_CODE,
    defaultItbisEnabled: Boolean(row?.itbis_cobro_por_defecto),
    fiscalModeFallback: normalizeFiscalMode(row?.fiscal_mode_fallback, false),
    ecfEnvironment: row?.ecf_environment || "certification",
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
