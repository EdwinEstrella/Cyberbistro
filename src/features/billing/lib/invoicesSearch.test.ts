import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  not: vi.fn(),
  neq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../../../shared/lib/supabase", () => {
  const qb: any = {
    select: mocks.select,
    eq: mocks.eq,
    or: mocks.or,
    not: mocks.not,
    neq: mocks.neq,
    order: mocks.order,
    limit: mocks.limit,
  };
  mocks.from.mockReturnValue(qb);
  mocks.select.mockReturnValue(qb);
  mocks.eq.mockReturnValue(qb);
  mocks.or.mockReturnValue(qb);
  mocks.not.mockReturnValue(qb);
  mocks.neq.mockReturnValue(qb);
  mocks.order.mockReturnValue(qb);
  return { supabase: { from: mocks.from } };
});

import { searchInvoicesGlobal } from "./invoicesSearch";

describe("searchInvoicesGlobal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("desktop: scans the full history without a date range or limit", async () => {
    const listInvoices = vi.fn().mockResolvedValue({
      ok: true,
      data: [
        { id: 1, numero_factura: 4055, created_at: "2024-01-01T00:00:00Z", items: "[]" },
        { id: 2, numero_factura: 12, created_at: "2026-01-01T00:00:00Z", items: "[]" },
        { id: 3, numero_factura: 13, created_at: "2025-01-01T00:00:00Z", cliente_nombre: "José 4055", items: "[]" },
      ],
    });
    vi.stubGlobal("window", { electronAPI: { listInvoices } });
    const res = await searchInvoicesGlobal("t1", "4055", { sucursalId: "s1" });
    expect(listInvoices).toHaveBeenCalledWith({ tenantId: "t1", sucursalId: "s1", limit: undefined });
    expect(res.rows.map((r) => r.id)).toEqual(["3", "1"]);
    expect(res.capped).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("desktop: applies the NCF-only filter on top of the search", async () => {
    const listInvoices = vi.fn().mockResolvedValue({
      ok: true,
      data: [
        { id: 1, numero_factura: 1, notas: "mesa", ncf: "B01", created_at: "2025-01-01T00:00:00Z", items: "[]" },
        { id: 2, numero_factura: 2, notas: "mesa", ncf: " ", created_at: "2025-01-02T00:00:00Z", items: "[]" },
      ],
    });
    vi.stubGlobal("window", { electronAPI: { listInvoices } });
    const res = await searchInvoicesGlobal("t1", "mesa", { onlyWithNcf: true });
    expect(res.rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("web: builds a sanitized or() filter and returns normalized rows", async () => {
    mocks.limit.mockResolvedValue({
      data: [{ id: 9, numero_factura: 1, created_at: "2026-01-01T00:00:00Z", cliente_nombre: "Pérez", items: "[]" }],
      error: null,
    });
    const res = await searchInvoicesGlobal("t1", "pé,rez(*)", { sucursalId: "s1" });
    expect(mocks.from).toHaveBeenCalledWith("facturas");
    expect(mocks.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(mocks.or).toHaveBeenCalledWith("sucursal_id.eq.s1,sucursal_id.is.null");
    const searchOr = mocks.or.mock.calls[1][0] as string;
    expect(searchOr).toBe(
      "ncf.ilike.*pé rez*,cliente_nombre.ilike.*pé rez*,cliente_rnc.ilike.*pé rez*,notas.ilike.*pé rez*",
    );
    expect(searchOr).not.toMatch(/[()\\%]/);
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(201);
    // "pé rez" is not a substring of "Pérez", so the pure matcher drops it.
    expect(res.rows).toEqual([]);
  });

  it("web: keeps matching rows and normalizes them", async () => {
    mocks.limit.mockResolvedValue({
      data: [{ id: 9, numero_factura: 4055, created_at: "2026-01-01T00:00:00Z", items: "[]" }],
      error: null,
    });
    const res = await searchInvoicesGlobal("t1", "4055");
    expect(mocks.or).toHaveBeenCalledTimes(1);
    expect(mocks.or.mock.calls[0][0]).toContain("numero_factura.eq.4055");
    expect(mocks.not).not.toHaveBeenCalled();
    expect(res.rows).toEqual([expect.objectContaining({ id: "9", items: [] })]);
  });

  it("web: pushes the NCF-only filter down", async () => {
    mocks.limit.mockResolvedValue({ data: [], error: null });
    await searchInvoicesGlobal("t1", "abc", { onlyWithNcf: true });
    expect(mocks.not).toHaveBeenCalledWith("ncf", "is", null);
    expect(mocks.neq).toHaveBeenCalledWith("ncf", "");
  });

  it("web: flags a capped result", async () => {
    const data = Array.from({ length: 201 }, (_, i) => ({
      id: i,
      numero_factura: i,
      notas: "x",
      created_at: new Date(2026, 0, 1, 0, i).toISOString(),
      items: [],
    }));
    mocks.limit.mockResolvedValue({ data, error: null });
    const res = await searchInvoicesGlobal("t1", "x");
    expect(res.rows).toHaveLength(200);
    expect(res.capped).toBe(true);
  });

  it("returns [] without querying when the query is empty after sanitizing", async () => {
    const res = await searchInvoicesGlobal("t1", ",()*");
    expect(res).toEqual({ rows: [], capped: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("web: surfaces query errors", async () => {
    mocks.limit.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(searchInvoicesGlobal("t1", "abc")).rejects.toThrow("boom");
  });
});
