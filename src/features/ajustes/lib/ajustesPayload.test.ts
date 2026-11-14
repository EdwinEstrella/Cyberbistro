import { describe, expect, it } from "vitest";
import { buildAjustesSavePayload } from "./ajustesPayload";
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
    fiscal_mode: "ncf_legacy",
    fiscal_mode_fallback: "internal_receipt",
    ecf_environment: "certification",
    ncf_tipo_default: "B01",
    ncf_secuencia_siguiente: 10,
    ncf_secuencias_por_tipo: {
      B01: 10,
      B02: 25,
      B14: 1,
      B15: 1,
      B16: 1,
      B17: 1,
    },
    ncf_tipos_activos: {
      B01: true,
      B02: true,
    },
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

  it("omits fiscal_mode and legacy NCF fields when existing tenant is dgii_ecf even if config has ncf_legacy", () => {
    const config = createMockConfig({
      fiscal_mode: "ncf_legacy",
      ncf_tipo_default: "B02",
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

  it("includes fiscal_mode when switching between internal_receipt and ncf_legacy", () => {
    const legacyConfig = createMockConfig({ fiscal_mode: "ncf_legacy" });
    const legacyPayload = buildAjustesSavePayload({ config: legacyConfig });
    expect(legacyPayload.fiscal_mode).toBe("ncf_legacy");
    expect(legacyPayload.ncf_fiscal_activo).toBe(true);

    const internalConfig = createMockConfig({ fiscal_mode: "internal_receipt" });
    const internalPayload = buildAjustesSavePayload({ config: internalConfig });
    expect(internalPayload.fiscal_mode).toBe("internal_receipt");
    expect(internalPayload.ncf_fiscal_activo).toBe(false);
  });

  it("writes B-series sequence columns and updates B sequences in ncf_secuencias_por_tipo", () => {
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

    expect(payload.ncf_b01_secuencia_siguiente).toBe(50);
    expect(payload.ncf_b02_secuencia_siguiente).toBe(120);
    expect(payload.ncf_b14_secuencia_siguiente).toBe(15);
    expect(payload.ncf_b15_secuencia_siguiente).toBe(8);
    expect(payload.ncf_b16_secuencia_siguiente).toBe(3);
    expect(payload.ncf_b17_secuencia_siguiente).toBe(9);

    expect(payload.ncf_secuencias_por_tipo.B01).toBe(50);
    expect(payload.ncf_secuencias_por_tipo.B02).toBe(120);
    expect(payload.ncf_secuencias_por_tipo.B14).toBe(15);
  });

  it("preserves existing e-CF (E-code) sequences and rejects any E-code sequence edits from Ajustes", () => {
    const config = createMockConfig({
      ncf_secuencias_por_tipo: {
        B01: 99,
        E31: 9999, // Should be ignored by Ajustes payload builder
        E32: 8888,
      },
    });

    const existingTenant = {
      ncf_secuencias_por_tipo: {
        B01: 10,
        E31: 42,
        E32: 100,
      },
    };

    const payload = buildAjustesSavePayload({ config, existingTenant });

    // B01 updated to 99
    expect(payload.ncf_b01_secuencia_siguiente).toBe(99);
    expect(payload.ncf_secuencias_por_tipo.B01).toBe(99);

    // E31 and E32 retained original values from existing tenant, ignoring config's attempt to overwrite
    expect(payload.ncf_secuencias_por_tipo.E31).toBe(42);
    expect(payload.ncf_secuencias_por_tipo.E32).toBe(100);
  });

  it("preserves existing e-CF active flags while applying B-code active flags", () => {
    const config = createMockConfig({
      ncf_tipos_activos: {
        B01: true,
        B02: false,
        E31: false, // Should NOT disable E31
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

    expect(payload.ncf_tipos_activos.B01).toBe(true);
    expect(payload.ncf_tipos_activos.B02).toBe(false);
    expect(payload.ncf_tipos_activos.E31).toBe(true);
  });

  it("formats base tenant information, clamping logo offsets and sizes", () => {
    const config = createMockConfig({
      nombre_empresa: "   Restaurante El Chef   ",
      logo_size_px: 150, // Should clamp to max 90
      logo_offset_x: -50, // Should clamp to min -28
      logo_offset_y: 40, // Should clamp to max 18
      itbis_incluido_en_precio: true,
      fiscal_mode_fallback: "ncf_legacy",
    });

    const payload = buildAjustesSavePayload({ config });

    expect(payload.nombre_negocio).toBe("Restaurante El Chef");
    expect(payload.logo_size_px).toBe(90);
    expect(payload.logo_offset_x).toBe(-28);
    expect(payload.logo_offset_y).toBe(18);
    expect(payload.itbis_incluido_en_precio).toBe(true);
    expect(payload.fiscal_mode_fallback).toBe("ncf_legacy");
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
