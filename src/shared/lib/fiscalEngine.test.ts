import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveActiveFiscalMode, runFiscalEngine, enqueueEcfDocuments, isEcfIssuerConfigComplete } from "./fiscalEngine";
import { resolveNcfForNewInvoiceLocalFirst, enqueueLocalWrite } from "./localFirst";
import { supabase } from "./supabase";
import { loadTenantBillingSettings } from "./tenantBillingSettings";

class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
}
vi.stubGlobal("localStorage", new LocalStorageMock());

vi.mock("./localFirst", () => ({
  resolveNcfForNewInvoiceLocalFirst: vi.fn(),
  enqueueLocalWrite: vi.fn(),
}));

vi.mock("./tenantBillingSettings", () => ({
  loadTenantBillingSettings: vi.fn(),
}));

vi.mock("./supabase", () => {
  const queryBuilder: any = {
    eq: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    limit: vi.fn(() => queryBuilder),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => queryBuilder),
      })),
    },
  };
});

describe("fiscalEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(loadTenantBillingSettings).mockResolvedValue({ ncfTiposActivos: {} } as any);
  });

  const validEcfSettings = {
    fiscalMode: "dgii_ecf" as const,
    ncfFiscalActive: false,
    defaultNcfType: "B01" as const,
    defaultItbisEnabled: true,
    rnc: "130862346",
    nombre: "Cyberbistro SRL",
    direccion: "Av. Winston Churchill",
    ecfIssuerSucursal: "Casa Matriz",
    ecfIssuerMunicipio: "Distrito Nacional",
    ecfIssuerProvincia: "Santo Domingo",
    ecfIssuerActividadEconomica: "5610",
    ecfIssuerCorreoEmisor: "billing@cyberbistro.com",
  };

  describe("resolveActiveFiscalMode", () => {
    it("uses the shared issuer requirements: complete data passes, any gap or malformed value fails", () => {
      expect(isEcfIssuerConfigComplete(validEcfSettings)).toBe(true);
      expect(isEcfIssuerConfigComplete({ ...validEcfSettings, ecfIssuerProvincia: " " })).toBe(false);
      expect(isEcfIssuerConfigComplete({ ...validEcfSettings, ecfIssuerCorreoEmisor: "sin-arroba" })).toBe(false);
      expect(isEcfIssuerConfigComplete({ ...validEcfSettings, rnc: "123" })).toBe(false);
    });

    it("falls back when the issuer email is malformed even if every field is filled", async () => {
      const settings = { ...validEcfSettings, ecfIssuerCorreoEmisor: "sin-arroba", fiscalModeFallback: "ncf_legacy" as const };
      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "ncf_legacy", certificateId: null });
    });

    it("returns internal_receipt if settings is null", async () => {
      const result = await resolveActiveFiscalMode("tenant-1", null, true);
      expect(result).toEqual({ mode: "internal_receipt", certificateId: null });
    });

    it("returns settings mode if not dgii_ecf", async () => {
      const settings = {
        fiscalMode: "ncf_legacy" as const,
        ncfFiscalActive: true,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
      };
      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "ncf_legacy", certificateId: null });
    });

    it("resolves dgii_ecf when certificate is ready online", async () => {
      const settings = { ...validEcfSettings };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "cert-uuid" }, error: null });
      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);
      vi.mocked(supabase.from).mockReturnValue({
        select: () => queryBuilder,
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: "cert-uuid" });
      expect(localStorage.getItem("ecf_cert_id_tenant-1")).toBeNull();
    });

    it("falls back to settings.fiscalModeFallback if certificate is not ready online", async () => {
      const settings = {
        ...validEcfSettings,
        fiscalModeFallback: "ncf_legacy" as const,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);
      vi.mocked(supabase.from).mockReturnValue({
        select: () => queryBuilder,
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "ncf_legacy", certificateId: null });
    });

    it("keeps dgii_ecf for non-admin sales staff when online query returns null due to RLS", async () => {
      const settings = {
        ...validEcfSettings,
        fiscalModeFallback: "internal_receipt" as const,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);
      vi.mocked(supabase.from).mockReturnValue({
        select: () => queryBuilder,
      } as any);

      const resultVentas = await resolveActiveFiscalMode("tenant-1", settings, true, "ventas");
      expect(resultVentas).toEqual({ mode: "dgii_ecf", certificateId: null });

      const resultCajera = await resolveActiveFiscalMode("tenant-1", settings, true, "cajera");
      expect(resultCajera).toEqual({ mode: "dgii_ecf", certificateId: null });
    });

    it("keeps dgii_ecf active offline without reading certificate data from local storage", async () => {
      const settings = { ...validEcfSettings };

      localStorage.setItem("ecf_cert_id_tenant-1", "stale-cert-uuid");

      const result = await resolveActiveFiscalMode("tenant-1", settings, false);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: null });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("falls back if any required configuration field is missing when online", async () => {
      const settings = {
        ...validEcfSettings,
        rnc: "", // missing
        fiscalModeFallback: "ncf_legacy" as const,
      };

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "ncf_legacy", certificateId: null });
    });

    it("resolves dgii_ecf and filters certificate by tenant environment when ready online", async () => {
      const settings = {
        ...validEcfSettings,
        ecfEnvironment: "production",
      };

      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockReturnThis();
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "cert-prod-1" }, error: null });

      const queryBuilder: any = {
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit,
        maybeSingle: mockMaybeSingle,
      };
      mockEq.mockReturnValue(queryBuilder);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => queryBuilder),
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: "cert-prod-1" });
      expect(mockEq).toHaveBeenCalledWith("environment", "production");
      expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it("keeps mode dgii_ecf pending backend validation when certificate query returns an error object", async () => {
      const settings = {
        ...validEcfSettings,
        ecfEnvironment: "production",
        fiscalModeFallback: "internal_receipt" as const,
      };

      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        }),
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => queryBuilder),
      } as any);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: null });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to check certificate readiness online"),
        expect.objectContaining({ code: "PGRST116" })
      );
      warnSpy.mockRestore();
    });

    it("falls back to fiscalModeFallback when certificate query succeeds but finds no cert", async () => {
      const settings = {
        ...validEcfSettings,
        ecfEnvironment: "production",
        fiscalModeFallback: "internal_receipt" as const,
      };

      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => queryBuilder),
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "internal_receipt", certificateId: null });
    });

    it("preserves non dgii_ecf modes unchanged without querying certificates", async () => {
      const settingsInternal = {
        ...validEcfSettings,
        fiscalMode: "internal_receipt" as const,
      };
      const resultInternal = await resolveActiveFiscalMode("tenant-1", settingsInternal, true);
      expect(resultInternal).toEqual({ mode: "internal_receipt", certificateId: null });

      const settingsLegacy = {
        ...validEcfSettings,
        fiscalMode: "ncf_legacy" as const,
      };
      const resultLegacy = await resolveActiveFiscalMode("tenant-1", settingsLegacy, true);
      expect(resultLegacy).toEqual({ mode: "ncf_legacy", certificateId: null });
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe("runFiscalEngine", () => {
    it("returns null for internal_receipt mode", async () => {
      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "internal_receipt",
        certificateId: null,
        facturaId: "invoice-1",
        numeroFactura: 10,
        deviceId: "device-1",
      });
      expect(result).toBeNull();
    });

    it("calls resolveNcfForNewInvoiceLocalFirst for ncf_legacy mode", async () => {
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
        ncf: "B0100000001",
        ncf_tipo: "B01",
        tipoCodigo: "B01",
        usedSequence: 1,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "ncf_legacy",
        certificateId: null,
        facturaId: "invoice-1",
        numeroFactura: 10,
        preferredNcfType: "B01",
        deviceId: "device-1",
      });

      expect(result).toEqual({
        ncf: "B0100000001",
        ncf_tipo: "B01",
        tipoCodigo: "B01",
        usedSequence: 1,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });
      expect(resolveNcfForNewInvoiceLocalFirst).toHaveBeenCalledWith("tenant-1", "B01");
    });

    it("resolves sequence for dgii_ecf mode with E31 (RNC present)", async () => {
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
        ncf: "E310000000045",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        tipoCodigo: "E31",
        usedSequence: 45,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 45,
        clientRnc: "130862346",
        deviceId: "device-1",
      });

      expect(result).toEqual({
        ncf: "E310000000045",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        tipoCodigo: "E31",
        usedSequence: 45,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
        certificateId: "cert-uuid",
        ecfType: "31",
      });
      expect(resolveNcfForNewInvoiceLocalFirst).toHaveBeenCalledWith("tenant-1", "E31");
    });

    it("resolves sequence for dgii_ecf mode with E32 (RNC empty)", async () => {
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
        ncf: "E320000000046",
        ncf_tipo: "E32 - Factura de consumo electronica",
        tipoCodigo: "E32",
        usedSequence: 46,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 46,
        clientRnc: "",
        deviceId: "device-1",
      });

      expect(result).toEqual({
        ncf: "E320000000046",
        ncf_tipo: "E32 - Factura de consumo electronica",
        tipoCodigo: "E32",
        usedSequence: 46,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
        certificateId: "cert-uuid",
        ecfType: "32",
      });
      expect(resolveNcfForNewInvoiceLocalFirst).toHaveBeenCalledWith("tenant-1", "E32");
    });

    it("returns null (no NCF) when the legacy consumo type is turned off", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce({
        ncfTiposActivos: { B02: false },
      } as any);

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "ncf_legacy",
        certificateId: null,
        facturaId: "invoice-1",
        numeroFactura: 11,
        preferredNcfType: "B02",
        deviceId: "device-1",
      });

      expect(result).toBeNull();
      expect(resolveNcfForNewInvoiceLocalFirst).not.toHaveBeenCalled();
    });

    it("fails closed when the active-type configuration cannot be loaded", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce(null);

      await expect(runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "ncf_legacy",
        certificateId: null,
        facturaId: "invoice-1",
        numeroFactura: 11,
        preferredNcfType: "B02",
        deviceId: "device-1",
      })).rejects.toThrow("No se pudo validar la configuración de tipos NCF.");

      expect(resolveNcfForNewInvoiceLocalFirst).not.toHaveBeenCalled();
    });

    it("returns null (no NCF) when the e-CF consumo type E32 is turned off", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce({
        ncfTiposActivos: { E32: false },
      } as any);

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 12,
        clientRnc: "",
        deviceId: "device-1",
      });

      expect(result).toBeNull();
      expect(resolveNcfForNewInvoiceLocalFirst).not.toHaveBeenCalled();
    });

    it("still emits an active type even if another type is off", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce({
        ncfTiposActivos: { B02: false },
      } as any);
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
        ncf: "B0100000002",
        ncf_tipo: "B01",
        tipoCodigo: "B01",
        usedSequence: 2,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "ncf_legacy",
        certificateId: null,
        facturaId: "invoice-1",
        numeroFactura: 13,
        preferredNcfType: "B01",
        deviceId: "device-1",
      });

      expect(result?.tipoCodigo).toBe("B01");
      expect(resolveNcfForNewInvoiceLocalFirst).toHaveBeenCalledWith("tenant-1", "B01");
    });

    it("handles resolveActiveFiscalMode online query error without blocking pending e-CF sales", async () => {
      const settings = {
        ...validEcfSettings,
        fiscalModeFallback: "ncf_legacy" as const,
      };

      // Mock database call to throw an error
      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockRejectedValue(new Error("Network Error")),
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);
      vi.mocked(supabase.from).mockReturnValue({
        select: () => queryBuilder,
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: null });
    });

    it("falls back to internal_receipt in resolveActiveFiscalMode if certificate not ready online and no fallback mode configured", async () => {
      const settings = { ...validEcfSettings };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const queryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      };
      queryBuilder.eq.mockReturnValue(queryBuilder);
      vi.mocked(supabase.from).mockReturnValue({
        select: () => queryBuilder,
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "internal_receipt", certificateId: null });
    });
  });

  describe("enqueueEcfDocuments", () => {
    it("enqueues as pending_offline/pending_sync if configuration is complete", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce({
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
        rnc: "130862346",
        nombre: "Cyberbistro SRL",
        direccion: "Av. Winston Churchill",
        ecfIssuerSucursal: "Casa Matriz",
        ecfIssuerMunicipio: "Distrito Nacional",
        ecfIssuerProvincia: "Santo Domingo",
        ecfIssuerActividadEconomica: "5610",
        ecfIssuerCorreoEmisor: "billing@cyberbistro.com",
      });

      await enqueueEcfDocuments({
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        certificateId: "cert-uuid",
        ecfType: "32",
        deviceId: "device-1",
      });

      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "ecf_documents",
        payload: expect.objectContaining({
          status: "pending_offline",
          certificate_metadata_id: "cert-uuid",
        }),
      }));

      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "fiscal_outbox",
        payload: expect.objectContaining({
          status: "pending_sync",
        }),
      }));
    });

    it("enqueues as pending_configuration/blocked_configuration if configuration is incomplete", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce({
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
        rnc: "", // missing
        nombre: "Cyberbistro SRL",
        direccion: "Av. Winston Churchill",
        ecfIssuerSucursal: "Casa Matriz",
        ecfIssuerMunicipio: "Distrito Nacional",
        ecfIssuerProvincia: "Santo Domingo",
        ecfIssuerActividadEconomica: "5610",
        ecfIssuerCorreoEmisor: "billing@cyberbistro.com",
      });

      await enqueueEcfDocuments({
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        certificateId: "cert-uuid",
        ecfType: "32",
        deviceId: "device-1",
      });

      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "ecf_documents",
        payload: expect.objectContaining({
          status: "pending_configuration",
        }),
      }));

      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "fiscal_outbox",
        payload: expect.objectContaining({
          status: "blocked_configuration",
        }),
      }));
    });

    it("enqueues as pending_configuration/blocked_configuration if certificateId is missing", async () => {
      vi.mocked(loadTenantBillingSettings).mockResolvedValueOnce({
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
        rnc: "130862346",
        nombre: "Cyberbistro SRL",
        direccion: "Av. Winston Churchill",
        ecfIssuerSucursal: "Casa Matriz",
        ecfIssuerMunicipio: "Distrito Nacional",
        ecfIssuerProvincia: "Santo Domingo",
        ecfIssuerActividadEconomica: "5610",
        ecfIssuerCorreoEmisor: "billing@cyberbistro.com",
      });

      await enqueueEcfDocuments({
        tenantId: "tenant-1",
        facturaId: "invoice-1",
        certificateId: null, // missing cert
        ecfType: "32",
        deviceId: "device-1",
      });

      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "ecf_documents",
        payload: expect.objectContaining({
          status: "pending_configuration",
          certificate_metadata_id: null,
        }),
      }));

      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "fiscal_outbox",
        payload: expect.objectContaining({
          status: "blocked_configuration",
        }),
      }));
    });

    it("throws an error in runFiscalEngine if legacy NCF sequence resolution returns null", async () => {
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValue(null);

      await expect(
        runFiscalEngine({
          tenantId: "tenant-1",
          activeMode: "ncf_legacy",
          certificateId: null,
          facturaId: "invoice-1",
          numeroFactura: 10,
          preferredNcfType: "B01",
          deviceId: "device-1",
        })
      ).rejects.toThrow("No se pudo reservar NCF fiscal.");
    });

    it("trims whitespace from RNC when determining dgii_ecf type E31 or E32", async () => {
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
        ncf: "E310000000047",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        tipoCodigo: "E31",
        usedSequence: 47,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 47,
        clientRnc: "  130862346  ",
        deviceId: "device-1",
      });

      expect(resolveNcfForNewInvoiceLocalFirst).toHaveBeenCalledWith("tenant-1", "E31");
      expect(result?.ecfType).toBe("31");
    });

    it("treats null or undefined RNC as empty and uses E32 in runFiscalEngine", async () => {
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValueOnce({
        ncf: "E320000000048",
        ncf_tipo: "E32 - Factura de consumo electronica",
        tipoCodigo: "E32",
        usedSequence: 48,
        sequenceReservedAtomically: true,
        reservationSource: "remote_rpc",
      });

      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 48,
        clientRnc: null,
        deviceId: "device-1",
      });

      expect(result?.ncf).toBe("E320000000048");
      expect(result?.tipoCodigo).toBe("E32");
    });
  });
});
