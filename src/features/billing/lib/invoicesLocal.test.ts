import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseSelect: vi.fn(),
  supabaseUpsert: vi.fn(),
  supabaseDelete: vi.fn(),
  supabaseEq: vi.fn(),
  supabaseOr: vi.fn(),
  supabaseOrder: vi.fn(),
  supabaseLimit: vi.fn(),
}));

vi.mock("../../../shared/lib/supabase", () => {
  const queryBuilder: any = {
    select: mocks.supabaseSelect,
    upsert: mocks.supabaseUpsert,
    delete: mocks.supabaseDelete,
    eq: mocks.supabaseEq,
    or: mocks.supabaseOr,
    order: mocks.supabaseOrder,
    limit: mocks.supabaseLimit,
  };
  mocks.supabaseSelect.mockReturnValue(queryBuilder);
  mocks.supabaseUpsert.mockReturnValue(queryBuilder);
  mocks.supabaseDelete.mockReturnValue(queryBuilder);
  mocks.supabaseEq.mockReturnValue(queryBuilder);
  mocks.supabaseOr.mockReturnValue(queryBuilder);
  mocks.supabaseOrder.mockReturnValue(queryBuilder);
  mocks.supabaseLimit.mockReturnValue(queryBuilder);

  return {
    supabase: {
      from: mocks.supabaseFrom.mockReturnValue(queryBuilder),
    },
  };
});

vi.mock("./invoicesCloud", () => ({
  fetchCloudInvoicesInRange: vi.fn(),
}));

import {
  readLocalInvoices,
  saveLocalInvoice,
  deleteLocalInvoice,
  normalizeInvoice,
  INVOICE_RANGE_LOAD_ERROR,
} from "./invoicesLocal";
import { fetchCloudInvoicesInRange } from "./invoicesCloud";

describe("invoicesLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("normalizeInvoice", () => {
    it("normalizes json items string to an array", () => {
      const normalized = normalizeInvoice({
        id: 123,
        items: JSON.stringify([{ plato_id: 1, cantidad: 2 }]),
      });
      expect(normalized.id).toBe("123");
      expect(normalized.items).toEqual([{ plato_id: 1, cantidad: 2 }]);
    });

    it("falls back to empty array on invalid json or null", () => {
      const normalized = normalizeInvoice({ id: "inv-1", items: "invalid-json" });
      expect(normalized.items).toEqual([]);

      const normalizedNull = normalizeInvoice({ id: "inv-2", items: null });
      expect(normalizedNull.items).toEqual([]);
    });
  });

  describe("Desktop (Electron with SQLite)", () => {
    it("reads invoices from electronAPI.listInvoices without touching IndexedDB or Supabase", async () => {
      const listInvoices = vi.fn().mockResolvedValue({
        ok: true,
        data: [{ id: "inv-sqlite-1", total: 100, created_at: "2026-09-21T10:00:00Z" }],
      });
      vi.stubGlobal("window", { electronAPI: { listInvoices } });

      const res = await readLocalInvoices("tenant-1");
      expect(listInvoices).toHaveBeenCalledWith({ tenantId: "tenant-1", sucursalId: undefined, limit: undefined });
      expect(res).toEqual([expect.objectContaining({ id: "inv-sqlite-1", total: 100 })]);
      expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    });

    it("passes dateFrom and dateTo options to electronAPI.listInvoices on desktop", async () => {
      const listInvoices = vi.fn().mockResolvedValue({
        ok: true,
        data: [{ id: "inv-range-1", total: 150, created_at: "2026-08-10T12:00:00Z" }],
      });
      vi.stubGlobal("window", { electronAPI: { listInvoices } });

      const res = await readLocalInvoices("tenant-1", {
        dateFrom: "2026-08-01T00:00:00Z",
        dateTo: "2026-08-31T23:59:59Z",
      });

      expect(listInvoices).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        sucursalId: undefined,
        limit: undefined,
        dateFrom: "2026-08-01T00:00:00Z",
        dateTo: "2026-08-31T23:59:59Z",
      });
      expect(res).toEqual([expect.objectContaining({ id: "inv-range-1", total: 150 })]);
      expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    });

    it("saves invoice directly via electronAPI.saveInvoiceLocal without touching IndexedDB or Supabase", async () => {
      const saveInvoiceLocal = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("window", { electronAPI: { saveInvoiceLocal } });

      await saveLocalInvoice({ id: "inv-1", tenant_id: "tenant-1", total: 500 });
      expect(saveInvoiceLocal).toHaveBeenCalledWith({ id: "inv-1", tenant_id: "tenant-1", total: 500 });
      expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    });

    it("deletes invoice directly via electronAPI.deleteInvoiceLocal without touching IndexedDB or Supabase", async () => {
      const deleteInvoiceLocal = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("window", { electronAPI: { deleteInvoiceLocal } });

      await deleteLocalInvoice("tenant-1", "inv-1");
      expect(deleteInvoiceLocal).toHaveBeenCalledWith({ tenantId: "tenant-1", invoiceId: "inv-1" });
      expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe("Web (Pure browser / Supabase cloud)", () => {
    it("reads invoices directly from Supabase without touching IndexedDB", async () => {
      mocks.supabaseOrder.mockResolvedValue({
        data: [{ id: "inv-cloud-1", total: 200, created_at: "2026-09-21T11:00:00Z" }],
        error: null,
      });

      const res = await readLocalInvoices("tenant-1");
      expect(mocks.supabaseFrom).toHaveBeenCalledWith("facturas");
      expect(res).toEqual([expect.objectContaining({ id: "inv-cloud-1", total: 200 })]);
    });

    it("uses fetchCloudInvoicesInRange on web when dateFrom or dateTo is provided and returns normalized rows", async () => {
      vi.mocked(fetchCloudInvoicesInRange).mockResolvedValue({
        data: [
          { id: 10, items: JSON.stringify([{ plato_id: 1 }]), total: 500 },
        ],
        error: null,
      });

      const res = await readLocalInvoices("tenant-1", {
        dateFrom: "2026-08-01T00:00:00Z",
        dateTo: "2026-08-31T23:59:59Z",
      });

      expect(fetchCloudInvoicesInRange).toHaveBeenCalledWith(
        expect.anything(),
        "tenant-1",
        {
          sucursalId: undefined,
          fromIso: "2026-08-01T00:00:00Z",
          toIso: "2026-08-31T23:59:59Z",
        }
      );
      expect(res).toEqual([
        expect.objectContaining({
          id: "10",
          items: [{ plato_id: 1 }],
          total: 500,
        }),
      ]);
    });

    it("throws INVOICE_RANGE_LOAD_ERROR when fetchCloudInvoicesInRange returns an error", async () => {
      vi.mocked(fetchCloudInvoicesInRange).mockResolvedValue({
        data: [],
        error: new Error("network timeout"),
      });

      await expect(
        readLocalInvoices("tenant-1", { dateFrom: "2026-08-01T00:00:00Z" })
      ).rejects.toThrow(INVOICE_RANGE_LOAD_ERROR);
    });

    it("throws INVOICE_RANGE_LOAD_ERROR when fetchCloudInvoicesInRange rejects", async () => {
      vi.mocked(fetchCloudInvoicesInRange).mockRejectedValue(new Error("fetch aborted"));

      await expect(
        readLocalInvoices("tenant-1", { dateTo: "2026-08-31T23:59:59Z" })
      ).rejects.toThrow(INVOICE_RANGE_LOAD_ERROR);
    });

    it("saves invoice directly to Supabase without touching IndexedDB", async () => {
      mocks.supabaseUpsert.mockResolvedValue({ error: null });

      await saveLocalInvoice({ id: "inv-1", total: 350 });
      expect(mocks.supabaseFrom).toHaveBeenCalledWith("facturas");
      expect(mocks.supabaseUpsert).toHaveBeenCalledWith([{ id: "inv-1", total: 350 }], { onConflict: "id" });
    });

    it("deletes invoice directly from Supabase without touching IndexedDB", async () => {
      mocks.supabaseEq.mockResolvedValue({ error: null });

      await deleteLocalInvoice("tenant-1", "inv-1");
      expect(mocks.supabaseFrom).toHaveBeenCalledWith("facturas");
      expect(mocks.supabaseDelete).toHaveBeenCalled();
      expect(mocks.supabaseEq).toHaveBeenCalledWith("id", "inv-1");
    });
  });
});
