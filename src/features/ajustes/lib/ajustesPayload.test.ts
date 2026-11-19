import { describe, expect, it } from "vitest";
import { buildAjustesSavePayload, mapTenantRowToAjustesConfig } from "./ajustesPayload";
import type { AjustesConfig } from "../types";

function createMockConfig(overrides?: Partial<AjustesConfig>): AjustesConfig {
  return {
    nombre_empresa: "Mi Restaurante",
    rnc: "131-00000-1",
    logo_url: "https://example.com/logo.png",
    logo_size_px: 60,
    logo_offset_x: 5,
    logo_offset_y: -2,
    menu_url: "https://cloudix.app/menu/test",
    direccion: "Av. Principal 123",
    telefono: "809-555-1234",
    currency_code: "DOP",
    itbis_cobro_por_defecto: true,
    itbis_incluido_en_precio: false,
    propina_cobro_por_defecto: true,
    kitchen_enabled: true,
    sin_comprobante_por_defecto: false,
    ncf_fiscal_activo: false,
    fiscal_mode: "internal_receipt",
    ecf_environment: "certification",
    ncf_tipo_default: "E32",
    ncf_secuencias_por_tipo: {},
    ncf_tipos_activos: {},
    ...overrides,
  };
}

describe("buildAjustesSavePayload", () => {
  it("never includes ecf_environment in the generated payload", () => {
    const config = createMockConfig({ ecf_environment: "production" });
    const payload = buildAjustesSavePayload({
      config,
      existingTenant: { ecf_environment: "production" } as any,
    });

    expect(payload).not.toHaveProperty("ecf_environment");
  });

  it("omits fiscal_mode when config has fiscal_mode === 'dgii_ecf' to avoid clobbering wizard state", () => {
    const config = createMockConfig({
      fiscal_mode: "dgii_ecf",
      ncf_tipo_default: "E31",
    });
    const payload = buildAjustesSavePayload({
      config,
      existingTenant: { fiscal_mode: "dgii_ecf" },
    });

    expect(payload).not.toHaveProperty("fiscal_mode");
    expect(payload).not.toHaveProperty("ncf_fiscal_activo");
    expect(payload).not.toHaveProperty("ncf_tipo_default");
    expect(payload).not.toHaveProperty("ncf_secuencia_siguiente");
  });

  it("omits fiscal_mode and legacy NCF fields when existing tenant is dgii_ecf even if config has legacy value", () => {
    const config = createMockConfig({
      fiscal_mode: "internal_receipt",
      ncf_tipo_default: "E32",
    });
    const payload = buildAjustesSavePayload({
      config,
      existingTenant: { fiscal_mode: "dgii_ecf" },
    });

    expect(payload).not.toHaveProperty("fiscal_mode");
    expect(payload).not.toHaveProperty("ncf_fiscal_activo");
    expect(payload).not.toHaveProperty("ncf_tipo_default");
    expect(payload).not.toHaveProperty("ncf_secuencia_siguiente");
  });

  it("includes fiscal_mode when saving non-eCF mode, converting legacy ncf_legacy to internal_receipt", () => {
    const legacyConfig = createMockConfig({ fiscal_mode: "ncf_legacy" as any });
    const legacyPayload = buildAjustesSavePayload({ config: legacyConfig });
    expect(legacyPayload.fiscal_mode).toBe("internal_receipt");
    expect(legacyPayload.ncf_fiscal_activo).toBe(false);

    const internalConfig = createMockConfig({ fiscal_mode: "internal_receipt" });
    const internalPayload = buildAjustesSavePayload({ config: internalConfig });
    expect(internalPayload.fiscal_mode).toBe("internal_receipt");
    expect(internalPayload.ncf_fiscal_activo).toBe(false);
  });

  it("never writes B-series sequence columns and omits ncf_secuencias_por_tipo entirely", () => {
    const config = createMockConfig({
      ncf_secuencias_por_tipo: {
        B01: 50,
        B02: 120,
        B14: 15,
        B15: 8,
        B16: 3,
        B17: 9,
      },
    });

    const payload = buildAjustesSavePayload({ config });

    expect(payload).not.toHaveProperty("ncf_b01_secuencia_siguiente");
    expect(payload).not.toHaveProperty("ncf_b02_secuencia_siguiente");
    expect(payload).not.toHaveProperty("ncf_b14_secuencia_siguiente");
    expect(payload).not.toHaveProperty("ncf_b15_secuencia_siguiente");
    expect(payload).not.toHaveProperty("ncf_b16_secuencia_siguiente");
    expect(payload).not.toHaveProperty("ncf_b17_secuencia_siguiente");
    expect(payload).not.toHaveProperty("ncf_secuencia_siguiente");

    expect(payload).not.toHaveProperty("ncf_secuencias_por_tipo");
  });

  it("never includes ncf_secuencias_por_tipo in payload even when existing tenant has sequences (regression: stale counters)", () => {
    const config = createMockConfig({
      ncf_secuencias_por_tipo: {
        B01: 99,
        E31: 9999, // Should be ignored by Ajustes payload builder
        E32: 8,
      },
    });

    const existingTenant = {
      ncf_secuencias_por_tipo: {
        B01: 7,
        E31: 42,
        E32: 8, // Stale snapshot from local mirror (regression test)
      },
    };

    const payload = buildAjustesSavePayload({ config, existingTenant });

    // B sequence columns are omitted from payload
    expect(payload).not.toHaveProperty("ncf_b01_secuencia_siguiente");

    // Settings never own sequence counters; must not write ncf_secuencias_por_tipo
    expect(payload).not.toHaveProperty("ncf_secuencias_por_tipo");
  });

  it("preserves existing B-code active flags unchanged while applying non-B toggles from config and ignoring B toggles", () => {
    const config = createMockConfig({
      ncf_tipos_activos: {
        B01: false, // Ignored; existing B01 stays true
        B02: false, // Ignored; existing B02 stays true
        E31: false, // Non-B toggle from config is applied
      },
    });

    const existingTenant = {
      ncf_tipos_activos: {
        B01: true,
        B02: true,
        E31: true,
      },
    };

    const payload = buildAjustesSavePayload({ config, existingTenant });

    // Existing B active flags are preserved unchanged, ignoring config B values
    expect(payload.ncf_tipos_activos.B01).toBe(true);
    expect(payload.ncf_tipos_activos.B02).toBe(true);

    // Non-B active toggle from config is applied
    expect(payload.ncf_tipos_activos.E31).toBe(false);
  });

  it("formats base tenant information, clamping logo offsets and sizes", () => {
    const config = createMockConfig({
      nombre_empresa: "   Restaurante El Chef   ",
      logo_size_px: 150, // Should clamp to max 90
      logo_offset_x: -50, // Should clamp to min -28
      logo_offset_y: 40, // Should clamp to max 18
      itbis_incluido_en_precio: true,
    });

    const payload = buildAjustesSavePayload({ config });

    expect(payload.nombre_negocio).toBe("Restaurante El Chef");
    expect(payload.logo_size_px).toBe(90);
    expect(payload.logo_offset_x).toBe(-28);
    expect(payload.logo_offset_y).toBe(18);
    expect(payload.itbis_incluido_en_precio).toBe(true);
    expect(payload.fiscal_mode_fallback).toBe("internal_receipt");
    expect(payload.updated_at).toBeDefined();
  });

  it("handles kitchen_enabled in payload (saving true, false, and defaulting to true)", () => {
    const payloadTrue = buildAjustesSavePayload({ config: createMockConfig({ kitchen_enabled: true }) });
    expect(payloadTrue.kitchen_enabled).toBe(true);

    const payloadFalse = buildAjustesSavePayload({ config: createMockConfig({ kitchen_enabled: false }) });
    expect(payloadFalse.kitchen_enabled).toBe(false);

    const payloadDefault = buildAjustesSavePayload({ config: createMockConfig({ kitchen_enabled: undefined as unknown as boolean }) });
    expect(payloadDefault.kitchen_enabled).toBe(true);
  });

  it("handles sin_comprobante_por_defecto in payload (saving true, false, and defaulting to false)", () => {
    const payloadTrue = buildAjustesSavePayload({ config: createMockConfig({ sin_comprobante_por_defecto: true }) });
    expect(payloadTrue.sin_comprobante_por_defecto).toBe(true);

    const payloadFalse = buildAjustesSavePayload({ config: createMockConfig({ sin_comprobante_por_defecto: false }) });
    expect(payloadFalse.sin_comprobante_por_defecto).toBe(false);

    const payloadDefault = buildAjustesSavePayload({ config: createMockConfig({ sin_comprobante_por_defecto: undefined as unknown as boolean }) });
    expect(payloadDefault.sin_comprobante_por_defecto).toBe(false);
  });
});

describe("mapTenantRowToAjustesConfig", () => {
  it("maps stored ncf_legacy to form internal_receipt, derives ncf_fiscal_activo only from dgii_ecf, and strips B defaults", () => {
    const stored = {
      nombre_negocio: "Restaurante Test",
      fiscal_mode: "ncf_legacy",
      ncf_fiscal_activo: true,
      ncf_tipo_default: "B01",
      ncf_secuencias_por_tipo: { B01: 50, E31: 10 },
      ncf_b01_secuencia_siguiente: 50,
      ncf_tipos_activos: { B01: true, E31: true },
    };

    const config = mapTenantRowToAjustesConfig(stored);

    expect(config.fiscal_mode).toBe("internal_receipt");
    expect(config.ncf_fiscal_activo).toBe(false);
    expect(config.ncf_tipo_default).toBe("E32");
    expect(config.ncf_secuencias_por_tipo).toEqual({ B01: 50, E31: 10 });
    expect(config.ncf_tipos_activos.E31).toBe(true);
  });

  it("maps stored dgii_ecf with ncf_fiscal_activo true", () => {
    const stored = {
      nombre_negocio: "Restaurante Test",
      fiscal_mode: "dgii_ecf",
      ncf_fiscal_activo: true,
      ncf_tipo_default: "E31",
      ncf_secuencias_por_tipo: { E31: 10 },
      ncf_tipos_activos: { E31: true },
    };

    const config = mapTenantRowToAjustesConfig(stored);

    expect(config.fiscal_mode).toBe("dgii_ecf");
    expect(config.ncf_fiscal_activo).toBe(true);
    expect(config.ncf_tipo_default).toBe("E31");
  });
});
