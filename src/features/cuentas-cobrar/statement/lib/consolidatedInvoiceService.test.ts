import { describe, expect, it, vi } from "vitest";
import {
  buildConsolidatedInvoiceConfirmMessage,
  mapConsolidatedInvoiceError,
  resolveRpcBranchId,
  formatRdCurrency,
  previewConsolidatedInvoice,
  issueConsolidatedInvoice,
} from "./consolidatedInvoiceService";
import { supabase } from "../../../../shared/lib/supabase";

vi.mock("../../../../shared/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe("consolidatedInvoiceService", () => {
  describe("resolveRpcBranchId", () => {
    it("returns null for non-UUID strings or falsy values", () => {
      expect(resolveRpcBranchId(null)).toBeNull();
      expect(resolveRpcBranchId(undefined)).toBeNull();
      expect(resolveRpcBranchId("default")).toBeNull();
      expect(resolveRpcBranchId("")).toBeNull();
    });

    it("returns the UUID when valid", () => {
      const id = "e8b5339c-0c82-4422-9ff0-24d189391e18";
      expect(resolveRpcBranchId(id)).toBe(id);
    });
  });

  describe("mapConsolidatedInvoiceError", () => {
    it("maps ITBIS_NOT_INCLUDED_UNSUPPORTED", () => {
      expect(mapConsolidatedInvoiceError("ITBIS_NOT_INCLUDED_UNSUPPORTED")).toBe(
        "La factura consolidada requiere que los precios incluyan ITBIS (Ajustes → Facturación → ITBIS incluido en precio). Así el total de la factura coincide con lo que debe la empresa."
      );
    });

    it("maps TOTAL_MISMATCH", () => {
      expect(mapConsolidatedInvoiceError("TOTAL_MISMATCH")).toBe(
        "No se pudo emitir: el total no coincide con la deuda. Contactá a soporte."
      );
    });

    it("maps PLAN_REQUIRED", () => {
      expect(mapConsolidatedInvoiceError("PLAN_REQUIRED")).toBe(
        "La facturación consolidada (e-CF) está disponible únicamente en el plan Corporativo."
      );
      expect(mapConsolidatedInvoiceError(new Error("error: PLAN_REQUIRED"))).toBe(
        "La facturación consolidada (e-CF) está disponible únicamente en el plan Corporativo."
      );
    });

    it("maps BUYER_RNC_INVALID", () => {
      expect(mapConsolidatedInvoiceError({ message: "BUYER_RNC_INVALID" })).toBe(
        "El RNC/Cédula del cliente no es válido. Debe tener 9 u 11 dígitos numéricos y un nombre registrado."
      );
    });

    it("maps NOTHING_TO_INVOICE", () => {
      expect(mapConsolidatedInvoiceError("NOTHING_TO_INVOICE")).toBe(
        "No hay pedidos pendientes de facturar para este cliente en el rango de fechas seleccionado."
      );
    });

    it("maps ORDER_ALREADY_INVOICED", () => {
      expect(mapConsolidatedInvoiceError("ORDER_ALREADY_INVOICED")).toBe(
        "Este pedido ya fue facturado; para corregirlo emití una nota de crédito."
      );
    });

    it("maps network errors", () => {
      expect(mapConsolidatedInvoiceError(new TypeError("Failed to fetch"))).toBe(
        "Sin conexión con la nube. Revisá tu conexión e intentá de nuevo."
      );
    });
  });

  describe("formatRdCurrency", () => {
    it("formats amounts in Dominican Pesos", () => {
      const formatted = formatRdCurrency(1500.5);
      expect(formatted).toContain("1,500.50");
    });
  });

  describe("buildConsolidatedInvoiceConfirmMessage", () => {
    it("builds the exact required confirmation message with formatted total", () => {
      const msg = buildConsolidatedInvoiceConfirmMessage("Acme SRL", 1180.5);
      expect(msg).toContain("Se emitirá un e-CF de crédito fiscal (E31) a Acme SRL por");
      expect(msg).toContain("Esta acción no se puede deshacer; correcciones con nota de crédito.");
    });
  });

  describe("RPC callers", () => {
    it("calls cloudix_preview_consolidated_invoice and returns data", async () => {
      const mockResult = {
        customer: { name: "Acme", document_id: "131123451", rnc_valid: true },
        rows: [],
        subtotal: 100,
        itbis: 18,
        total: 118,
        count: 1,
        blocked_reason: null,
      };
      (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const res = await previewConsolidatedInvoice("cust-1", "2026-10-01", "2026-10-31");
      expect(res).toEqual(mockResult);
      expect(supabase.rpc).toHaveBeenCalledWith("cloudix_preview_consolidated_invoice", {
        p_customer_id: "cust-1",
        p_from: "2026-10-01",
        p_to: "2026-10-31",
        p_sucursal_id: null,
      });
    });

    it("calls cloudix_issue_consolidated_invoice and throws mapped error on failure", async () => {
      (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: "PLAN_REQUIRED" },
      });

      await expect(
        issueConsolidatedInvoice("cust-1", "2026-10-01", "2026-10-31")
      ).rejects.toThrow("La facturación consolidada (e-CF) está disponible únicamente en el plan Corporativo.");
    });
  });
});
