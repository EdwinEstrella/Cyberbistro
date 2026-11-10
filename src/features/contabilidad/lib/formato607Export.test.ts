import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildMonthOptions,
  executeFormato607Export,
  previousMonthValue,
} from "./formato607Export";
import type { Formato607DataResult } from "./formato607Data";

describe("formato607Export", () => {
  const sampleResult: Formato607DataResult = {
    emitterRnc: "131123456",
    rows: [
      {
        rnc_cedula: "101123456",
        tipo_identificacion: "1",
        ncf: "B0100000001",
        ncf_modificado: null,
        tipo_ingreso: "1",
        fecha_comprobante: "2026-08-15",
        fecha_retencion: null,
        monto_facturado: 1000,
        itbis_facturado: 180,
        itbis_retenido: 0,
        itbis_percibido: 0,
        retencion_renta: 0,
        isr_percibido: 0,
        impuesto_selectivo: 0,
        otros_impuestos: 0,
        propina_legal: 100,
        efectivo: 1280,
        cheque_transferencia_deposito: 0,
        tarjeta: 0,
        venta_credito: 0,
        bonos_certificados: 0,
        permuta: 0,
        otras_formas: 0,
      },
    ],
    summary: {
      count: 3,
      totalMontoFacturado: 1200,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dominican calendar for defaults", () => {
    it("returns December of previous year when Dominican month is January", () => {
      const nowJan = new Date("2026-01-15T12:00:00Z");
      expect(previousMonthValue(nowJan)).toBe("2025-12");
    });

    it("correctly identifies August (previous = July) when late-night UTC is still Aug 31 in Santo Domingo", () => {
      // 2026-09-01T02:00:00Z is 2026-08-31 22:00:00 in America/Santo_Domingo (UTC-4)
      const lateNightAug31 = new Date("2026-09-01T02:00:00Z");
      expect(previousMonthValue(lateNightAug31)).toBe("2026-07");
    });

    it("returns July when Dominican date is in August", () => {
      const augNoon = new Date("2026-08-15T12:00:00Z");
      expect(previousMonthValue(augNoon)).toBe("2026-07");
    });

    it("buildMonthOptions returns 24 options starting from current Dominican month backwards", () => {
      const jan = new Date("2026-01-15T12:00:00Z");
      const options = buildMonthOptions(jan);

      expect(options).toHaveLength(24);
      expect(options[0].value).toBe("2026-01");
      expect(options[1].value).toBe("2025-12");
      expect(options[23].value).toBe("2024-02");
      expect(options[0].label).toMatch(/enero/i);
      expect(options[1].label).toMatch(/diciembre/i);
    });

    it("buildMonthOptions respects Dominican late-night date", () => {
      const lateNightAug31 = new Date("2026-09-01T02:00:00Z");
      const options = buildMonthOptions(lateNightAug31);

      expect(options[0].value).toBe("2026-08");
      expect(options[1].value).toBe("2026-07");
    });
  });

  describe("executeFormato607Export orchestration", () => {
    it("throws if tenantId is missing", async () => {
      await expect(
        executeFormato607Export("", "2026-08", "txt")
      ).rejects.toThrow("No hay un negocio activo seleccionado.");
    });

    it("throws if selected month is invalid", async () => {
      await expect(
        executeFormato607Export("tenant-1", "invalid-month", "txt")
      ).rejects.toThrow("Seleccioná un mes válido para exportar.");
    });

    it("loads data, generates TXT, triggers download, and returns success summary", async () => {
      const mockLoad = vi.fn().mockResolvedValue(sampleResult);
      const mockGenerate = vi.fn().mockReturnValue("607|131123456|202608|1\r\nrow1");
      const mockDownload = vi.fn();

      const result = await executeFormato607Export("tenant-123", "2026-08", "txt", {
        loadData: mockLoad,
        generate: mockGenerate,
        download: mockDownload,
      });

      expect(mockLoad).toHaveBeenCalledWith("tenant-123", "202608");
      expect(mockGenerate).toHaveBeenCalledWith(
        "131123456",
        "202608",
        sampleResult.rows,
        "txt"
      );
      expect(mockDownload).toHaveBeenCalledWith(
        "DGII-607-202608.txt",
        "607|131123456|202608|1\r\nrow1",
        "text/plain;charset=utf-8"
      );
      expect(result.successMessage).toBe("Formato 607 generado con 1 comprobante(s).");
      expect(result.dataResult).toEqual(sampleResult);
    });

    it("triggers download with csv mime type when format is csv", async () => {
      const mockLoad = vi.fn().mockResolvedValue(sampleResult);
      const mockGenerate = vi.fn().mockReturnValue("\uFEFFheader\r\nrow1");
      const mockDownload = vi.fn();

      await executeFormato607Export("tenant-123", "2026-08", "csv", {
        loadData: mockLoad,
        generate: mockGenerate,
        download: mockDownload,
      });

      expect(mockDownload).toHaveBeenCalledWith(
        "DGII-607-202608.csv",
        "\uFEFFheader\r\nrow1",
        "text/csv;charset=utf-8"
      );
    });

    it("propagates error when data loading fails", async () => {
      const mockLoad = vi.fn().mockRejectedValue(new Error("Error de conexión"));

      await expect(
        executeFormato607Export("tenant-123", "2026-08", "txt", {
          loadData: mockLoad,
        })
      ).rejects.toThrow("Error de conexión");
    });
  });
});
