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

  it("defaults sinComprobantePorDefecto to false and maps sin_comprobante_por_defecto when present", () => {
    expect(normalizeTenantBillingSettings(null).sinComprobantePorDefecto).toBe(false);
    expect(normalizeTenantBillingSettings({}).sinComprobantePorDefecto).toBe(false);
    expect(normalizeTenantBillingSettings({ sin_comprobante_por_defecto: false }).sinComprobantePorDefecto).toBe(false);
    expect(normalizeTenantBillingSettings({ sin_comprobante_por_defecto: true }).sinComprobantePorDefecto).toBe(true);
  });

  it("defaults itbisIncluded to false and maps itbis_incluido_en_precio when present", () => {
    expect(normalizeTenantBillingSettings(null).itbisIncluded).toBe(false);
    expect(normalizeTenantBillingSettings({}).itbisIncluded).toBe(false);
    expect(normalizeTenantBillingSettings({ itbis_incluido_en_precio: true }).itbisIncluded).toBe(true);
  });

  it("maps ecfAuthorizedTypes when present, returns null when absent, and handles malformed values safely", () => {
    // Present valid ranges
    const present = normalizeTenantBillingSettings({
      ecf_secuencias_rangos: {
        E31: { start: 1, end: 100 },
        E32: { start: 1, end: 500 },
      },
    });
    expect(present.ecfAuthorizedTypes).toEqual(["E31", "E32"]);

    // Present valid JSON string
    const presentJson = normalizeTenantBillingSettings({
      ecf_secuencias_rangos: JSON.stringify({
        E31: { start: 1, end: 100 },
      }),
    });
    expect(presentJson.ecfAuthorizedTypes).toEqual(["E31"]);

    // Absent (null, undefined, missing property)
    expect(normalizeTenantBillingSettings(null).ecfAuthorizedTypes).toBeNull();
    expect(normalizeTenantBillingSettings({}).ecfAuthorizedTypes).toBeNull();
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: null }).ecfAuthorizedTypes).toBeNull();
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: undefined }).ecfAuthorizedTypes).toBeNull();

    // Malformed input returns null (no range filtering, cashier is not locked out)
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: "not-json" }).ecfAuthorizedTypes).toBeNull();
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: 12345 }).ecfAuthorizedTypes).toBeNull();

    // Valid empty object or record with no valid ranges returns [] (no authorized ranges is a real state)
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: {} }).ecfAuthorizedTypes).toEqual([]);
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: "{}" }).ecfAuthorizedTypes).toEqual([]);
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: { E31: { start: 100, end: 1 } } }).ecfAuthorizedTypes).toEqual([]);
    expect(normalizeTenantBillingSettings({ ecf_secuencias_rangos: { invalid_key: "bad" } }).ecfAuthorizedTypes).toEqual([]);
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
