import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveActiveFiscalMode, runFiscalEngine } from "./fiscalEngine";
import { resolveNcfForNewInvoiceLocalFirst, enqueueLocalWrite } from "./localFirst";
import { insforgeClient } from "./insforge";

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

vi.mock("./insforge", () => ({
  insforgeClient: {
    database: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(),
            })),
            maybeSingle: vi.fn(),
          })),
        })),
      })),
    },
  },
}));

describe("fiscalEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("resolveActiveFiscalMode", () => {
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
      const settings = {
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "cert-uuid" }, error: null });
      vi.mocked(insforgeClient.database.from).mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: "cert-uuid" });
      expect(localStorage.getItem("ecf_cert_id_tenant-1")).toBe("cert-uuid");
    });

    it("falls back to settings.fiscalModeFallback if certificate is not ready online", async () => {
      const settings = {
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
        fiscalModeFallback: "ncf_legacy" as const,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(insforgeClient.database.from).mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "ncf_legacy", certificateId: null });
    });

    it("reads certificate from cache when offline", async () => {
      const settings = {
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
      };

      localStorage.setItem("ecf_cert_id_tenant-1", "cached-cert-uuid");

      const result = await resolveActiveFiscalMode("tenant-1", settings, false);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: "cached-cert-uuid" });
      expect(insforgeClient.database.from).not.toHaveBeenCalled();
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
      vi.mocked(resolveNcfForNewInvoiceLocalFirst).mockResolvedValue({
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

    it("creates local fiscal intent and outbox writes for dgii_ecf mode with E31 (RNC present)", async () => {
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
        ncf: "E3100000045",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        tipoCodigo: "E31",
        usedSequence: 45,
        sequenceReservedAtomically: true,
        reservationSource: "dgii_ecf_engine",
      });

      expect(enqueueLocalWrite).toHaveBeenCalledTimes(2);
      expect(enqueueLocalWrite).toHaveBeenNthCalledWith(1, expect.objectContaining({
        tableName: "ecf_documents",
        op: "insert",
        payload: expect.objectContaining({
          factura_id: "invoice-1",
          certificate_metadata_id: "cert-uuid",
          ecf_type: "31",
          status: "pending_sync",
        }),
      }));
      expect(enqueueLocalWrite).toHaveBeenNthCalledWith(2, expect.objectContaining({
        tableName: "fiscal_outbox",
        op: "insert",
        payload: expect.objectContaining({
          factura_id: "invoice-1",
          operation: "submit",
          status: "queued",
          idempotency_key: "tenant-1:invoice-1:submit",
        }),
      }));
    });

    it("creates local fiscal intent and outbox writes for dgii_ecf mode with E32 (RNC empty)", async () => {
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
        ncf: "E3200000046",
        ncf_tipo: "E32 - Factura de consumo electronica",
        tipoCodigo: "E32",
        usedSequence: 46,
        sequenceReservedAtomically: true,
        reservationSource: "dgii_ecf_engine",
      });

      expect(enqueueLocalWrite).toHaveBeenCalledTimes(2);
      expect(enqueueLocalWrite).toHaveBeenNthCalledWith(1, expect.objectContaining({
        tableName: "ecf_documents",
        payload: expect.objectContaining({
          ecf_type: "32",
        }),
      }));
    });

    it("handles resolveActiveFiscalMode online query error and falls back to cached certificate ID", async () => {
      const settings = {
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
        fiscalModeFallback: "ncf_legacy" as const,
      };

      localStorage.setItem("ecf_cert_id_tenant-1", "cached-cert-id");

      // Mock database call to throw an error
      vi.mocked(insforgeClient.database.from).mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockRejectedValue(new Error("Network Error")),
            }),
          }),
        }),
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "dgii_ecf", certificateId: "cached-cert-id" });
    });

    it("falls back to internal_receipt in resolveActiveFiscalMode if certificate not ready online and no fallback mode configured", async () => {
      const settings = {
        fiscalMode: "dgii_ecf" as const,
        ncfFiscalActive: false,
        defaultNcfType: "B01" as const,
        defaultItbisEnabled: true,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(insforgeClient.database.from).mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
      } as any);

      const result = await resolveActiveFiscalMode("tenant-1", settings, true);
      expect(result).toEqual({ mode: "internal_receipt", certificateId: null });
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
      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 47,
        clientRnc: "  130862346  ",
        deviceId: "device-1",
      });

      expect(result?.ncf).toBe("E3100000047");
      expect(result?.tipoCodigo).toBe("E31");
    });

    it("treats null or undefined RNC as empty and uses E32 in runFiscalEngine", async () => {
      const result = await runFiscalEngine({
        tenantId: "tenant-1",
        activeMode: "dgii_ecf",
        certificateId: "cert-uuid",
        facturaId: "invoice-1",
        numeroFactura: 48,
        clientRnc: null,
        deviceId: "device-1",
      });

      expect(result?.ncf).toBe("E3200000048");
      expect(result?.tipoCodigo).toBe("E32");
    });
  });
});
