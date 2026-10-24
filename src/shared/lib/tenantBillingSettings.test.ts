import { describe, expect, it, vi } from "vitest";
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

  it("defaults itbisIncluded to false and maps itbis_incluido_en_precio when present", () => {
    expect(normalizeTenantBillingSettings(null).itbisIncluded).toBe(false);
    expect(normalizeTenantBillingSettings({}).itbisIncluded).toBe(false);
    expect(normalizeTenantBillingSettings({ itbis_incluido_en_precio: true }).itbisIncluded).toBe(true);
  });
});

describe("loadTenantBillingSettings offline", () => {
  it("resolves from the local tenant row when the cloud read throws", async () => {
    vi.resetModules();
    vi.doMock("./supabase", () => ({
      supabase: { from: () => { throw new Error("fetch failed"); } },
    }));
    vi.doMock("./cloudAvailability", () => ({
      isCloudAvailabilityFailure: () => true,
      isDesktopCloudUnavailable: async () => false,
      recordCloudFailure: () => undefined,
      recordCloudSuccess: () => undefined,
    }));
    const rows: Array<Record<string, unknown>> = [{ id: "t1", ncf_fiscal_activo: true, ncf_tipo_default: "B01" }];
    vi.doMock("./localFirst", () => ({ readLocalMirror: async () => rows }));
    const mod = await import("./tenantBillingSettings");
    await expect(mod.loadTenantBillingSettings("t1")).resolves.toMatchObject({
      fiscalMode: "ncf_legacy",
      defaultNcfType: "B01",
    });
    rows.length = 0;
    await expect(mod.loadTenantBillingSettings("t1")).resolves.toBeNull();
    vi.doUnmock("./supabase");
    vi.doUnmock("./cloudAvailability");
    vi.doUnmock("./localFirst");
  });
});
