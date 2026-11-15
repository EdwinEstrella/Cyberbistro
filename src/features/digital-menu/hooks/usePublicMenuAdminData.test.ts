import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTableCount } from "./usePublicMenuAdminData";
import { readLocalMirror } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";

vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: vi.fn(),
}));

const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};

vi.mock("../../../shared/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockImplementation(() => mockQueryBuilder),
  },
}));

describe("fetchTableCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("returns 0 if tenantId is missing", async () => {
    const count = await fetchTableCount("");
    expect(count).toBe(0);
    expect(readLocalMirror).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns sucursal table count when sucursalId is provided and local count > 0", async () => {
    vi.mocked(readLocalMirror).mockImplementation((_tenantId, table) => {
      if (table === "sucursales") {
        return Promise.resolve([{ id: "suc-1", cantidad_mesas: 12 }]);
      }
      return Promise.resolve([]);
    });

    const count = await fetchTableCount("tenant-1", "suc-1");
    expect(count).toBe(12);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns local tenant table count when > 0 without querying cloud", async () => {
    vi.mocked(readLocalMirror).mockImplementation((_tenantId, table) => {
      if (table === "tenants") {
        return Promise.resolve([{ id: "tenant-1", cantidad_mesas: 10 }]);
      }
      return Promise.resolve([]);
    });

    const count = await fetchTableCount("tenant-1");
    expect(count).toBe(10);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("falls through to cloud lookup when local tenant has cantidad_mesas === 0", async () => {
    // Local mirror has 0 (unconfigured or pre-sync local placeholder)
    vi.mocked(readLocalMirror).mockImplementation((_tenantId, table) => {
      if (table === "tenants") {
        return Promise.resolve([{ id: "tenant-1", cantidad_mesas: 0 }]);
      }
      return Promise.resolve([]);
    });

    // Cloud has actual configured tables (e.g. 8)
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { cantidad_mesas: 8 },
      error: null,
    });

    const count = await fetchTableCount("tenant-1");

    expect(count).toBe(8);
    expect(supabase.from).toHaveBeenCalledWith("tenants");
    expect(mockQueryBuilder.select).toHaveBeenCalledWith("cantidad_mesas");
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith("id", "tenant-1");
  });

  it("falls through to cloud lookup when local mirror is missing/empty", async () => {
    vi.mocked(readLocalMirror).mockResolvedValue([]);

    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { cantidad_mesas: 15 },
      error: null,
    });

    const count = await fetchTableCount("tenant-1");

    expect(count).toBe(15);
    expect(supabase.from).toHaveBeenCalledWith("tenants");
  });

  it("returns 0 when neither local nor cloud have configured tables", async () => {
    vi.mocked(readLocalMirror).mockImplementation((_tenantId, table) => {
      if (table === "tenants") {
        return Promise.resolve([{ id: "tenant-1", cantidad_mesas: 0 }]);
      }
      return Promise.resolve([]);
    });

    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const count = await fetchTableCount("tenant-1");
    expect(count).toBe(0);
  });
});
