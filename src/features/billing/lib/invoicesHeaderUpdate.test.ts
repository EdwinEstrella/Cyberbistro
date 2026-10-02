import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  neq: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../../../shared/lib/supabase", () => {
  const qb: any = { select: mocks.select, update: mocks.update, eq: mocks.eq, neq: mocks.neq, limit: mocks.limit };
  mocks.from.mockReturnValue(qb);
  mocks.select.mockReturnValue(qb);
  mocks.update.mockReturnValue(qb);
  mocks.eq.mockReturnValue(qb);
  mocks.neq.mockReturnValue(qb);
  return { supabase: { from: mocks.from } };
});

import { InvoiceNcfDuplicateError, updateInvoiceHeader } from "./invoicesLocal";

describe("updateInvoiceHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.limit.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing when there are no changes", async () => {
    const updateInvoiceHeaderLocal = vi.fn();
    vi.stubGlobal("window", { electronAPI: { updateInvoiceHeaderLocal } });
    await updateInvoiceHeader("t1", "inv-1", {});
    expect(updateInvoiceHeaderLocal).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("desktop: checks the cloud NCF, then calls the IPC with only the changes", async () => {
    const updateInvoiceHeaderLocal = vi.fn().mockResolvedValue({ ok: true, changed: true });
    vi.stubGlobal("window", { electronAPI: { updateInvoiceHeaderLocal } });

    await updateInvoiceHeader("t1", "inv-1", { ncf: "B0200000009", ncf_tipo: "B02" });

    expect(mocks.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(mocks.eq).toHaveBeenCalledWith("ncf", "B0200000009");
    expect(mocks.neq).toHaveBeenCalledWith("id", "inv-1");
    expect(updateInvoiceHeaderLocal).toHaveBeenCalledWith({
      tenantId: "t1",
      invoiceId: "inv-1",
      changes: { ncf: "B0200000009", ncf_tipo: "B02" },
    });
  });

  it("desktop: rejects when the cloud already has the NCF on another invoice", async () => {
    const updateInvoiceHeaderLocal = vi.fn();
    vi.stubGlobal("window", { electronAPI: { updateInvoiceHeaderLocal } });
    mocks.limit.mockResolvedValue({ data: [{ id: "other", numero_factura: 77 }], error: null });

    await expect(updateInvoiceHeader("t1", "inv-1", { ncf: "B0200000009" })).rejects.toThrow(
      "El NCF B0200000009 ya está asignado a la factura #77."
    );
    expect(updateInvoiceHeaderLocal).not.toHaveBeenCalled();
  });

  it("desktop: still saves locally when the cloud check fails (offline)", async () => {
    const updateInvoiceHeaderLocal = vi.fn().mockResolvedValue({ ok: true, changed: true });
    vi.stubGlobal("window", { electronAPI: { updateInvoiceHeaderLocal } });
    mocks.limit.mockRejectedValue(new Error("network down"));

    await updateInvoiceHeader("t1", "inv-1", { ncf: "B0200000009" });
    expect(updateInvoiceHeaderLocal).toHaveBeenCalled();
  });

  it("desktop: surfaces the local duplicate detected by SQLite", async () => {
    const updateInvoiceHeaderLocal = vi.fn().mockResolvedValue({ ok: false, reason: "ncf_duplicate", numeroFactura: 5 });
    vi.stubGlobal("window", { electronAPI: { updateInvoiceHeaderLocal } });

    const promise = updateInvoiceHeader("t1", "inv-1", { ncf: "B0200000009" });
    await expect(promise).rejects.toBeInstanceOf(InvoiceNcfDuplicateError);
    await expect(promise).rejects.toThrow("#5");
  });

  it("does not run the NCF check when the NCF is not part of the changes", async () => {
    const updateInvoiceHeaderLocal = vi.fn().mockResolvedValue({ ok: true, changed: true });
    vi.stubGlobal("window", { electronAPI: { updateInvoiceHeaderLocal } });
    await updateInvoiceHeader("t1", "inv-1", { notas: "x" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("web: updates only the changed header fields in Supabase scoped by id and tenant", async () => {
    mocks.eq.mockReset();
    const qb: any = { eq: mocks.eq };
    mocks.eq.mockReturnValueOnce(qb).mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue(qb);

    await updateInvoiceHeader("t1", "inv-1", { notas: "hola" });

    expect(mocks.update).toHaveBeenCalledWith({ notas: "hola", updated_at: expect.any(String) });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", "inv-1");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "tenant_id", "t1");
  });
});
