import { insforgeClient } from "./insforge";
import { DEFAULT_NCF_B_CODE, isNcfBCode, type NcfBCode } from "./ncf";

export interface TenantBillingSettingsRow {
  ncf_fiscal_activo?: boolean | null;
  ncf_tipo_default?: string | null;
  itbis_cobro_por_defecto?: boolean | null;
}

export interface TenantBillingSettings {
  ncfFiscalActive: boolean;
  defaultNcfType: NcfBCode;
  defaultItbisEnabled: boolean;
}

const TENANT_BILLING_SETTINGS_SELECT =
  "ncf_fiscal_activo, ncf_tipo_default, itbis_cobro_por_defecto";

export function normalizeTenantBillingSettings(
  row: TenantBillingSettingsRow | null | undefined
): TenantBillingSettings {
  return {
    ncfFiscalActive: Boolean(row?.ncf_fiscal_activo),
    defaultNcfType: isNcfBCode(row?.ncf_tipo_default)
      ? row.ncf_tipo_default
      : DEFAULT_NCF_B_CODE,
    defaultItbisEnabled: Boolean(row?.itbis_cobro_por_defecto),
  };
}

export async function loadTenantBillingSettings(
  tenantId: string
): Promise<TenantBillingSettings | null> {
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

  if (res.error || !res.data) return null;
  return normalizeTenantBillingSettings(res.data as TenantBillingSettingsRow);
}
