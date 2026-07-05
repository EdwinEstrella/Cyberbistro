import { describe, expect, it } from "vitest";
import { normalizeTenantBillingSettings } from "./tenantBillingSettings";

describe("normalizeTenantBillingSettings", () => {
  it("maps legacy false NCF settings to internal receipt mode", () => {
    expect(normalizeTenantBillingSettings({ ncf_fiscal_activo: false })).toMatchObject({
      fiscalMode: "internal_receipt",
      ncfFiscalActive: false,
    });
  });

  it("maps legacy true NCF settings to legacy NCF mode", () => {
    expect(normalizeTenantBillingSettings({ ncf_fiscal_activo: true })).toMatchObject({
      fiscalMode: "ncf_legacy",
      ncfFiscalActive: true,
    });
  });

  it("prefers explicit e-CF mode over legacy B-series NCF reservation", () => {
    expect(
      normalizeTenantBillingSettings({
        fiscal_mode: "dgii_ecf",
        ncf_fiscal_activo: true,
        ncf_tipo_default: "B02",
      })
    ).toMatchObject({
      fiscalMode: "dgii_ecf",
      ncfFiscalActive: false,
      defaultNcfType: "B02",
    });
  });

  it("defaults legal gratuity to off and maps the tenant default when present", () => {
    expect(normalizeTenantBillingSettings(null).defaultPropinaEnabled).toBe(false);
    expect(normalizeTenantBillingSettings({ propina_cobro_por_defecto: true }).defaultPropinaEnabled).toBe(true);
  });
});
