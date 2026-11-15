import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTableCount, loadPublicMenuAdminSources } from "./usePublicMenuAdminData";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";

vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: vi.fn(),
  shouldReadLocalFirst: vi.fn(),
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

describe("loadPublicMenuAdminSources", () => {
  const cloudPlatos = [
    { id: 1, nombre: "Burger", precio: "350", categoria: "Comida", disponible: true, va_a_cocina: true, sucursal_id: null },
    { id: 2, nombre: "Papas", precio: 150, categoria: "Comida", disponible: 1, va_a_cocina: 0, sucursal_id: "suc-1" },
    { id: 3, nombre: "Otra sucursal", precio: 100, categoria: "Comida", disponible: true, va_a_cocina: true, sucursal_id: "suc-2" },
  ];
  const cloudSettings = [{ tenant_id: "tenant-1", sucursal_id: null, enabled: true }];
  const cloudItems = [
    { id: "mi-1", tenant_id: "tenant-1", plato_id: 1, visible: true },
    { id: "mi-x", tenant_id: "tenant-other", plato_id: 9, visible: true },
  ];

  function cloudReaders(overrides: Record<string, unknown> = {}) {
    return {
      readLocalPlatos: vi.fn().mockResolvedValue([]),
      readLocalMirror: vi.fn().mockResolvedValue([]),
      fetchCloudPlatos: vi.fn().mockResolvedValue({ data: cloudPlatos, error: null }),
      fetchCloudSettings: vi.fn().mockResolvedValue({ data: cloudSettings, error: null }),
      fetchCloudMenuItems: vi.fn().mockResolvedValue({ data: cloudItems, error: null }),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
  });

  it("web: reads dishes, settings and items from the cloud even when the local mirror is empty", async () => {
    const readers = cloudReaders();

    const result = await loadPublicMenuAdminSources({
      tenantId: "tenant-1",
      sucursalId: "suc-1",
      localFirst: false,
      readers,
    });

    expect(readers.fetchCloudPlatos).toHaveBeenCalledWith("tenant-1");
    expect(readers.fetchCloudSettings).toHaveBeenCalledWith("tenant-1");
    expect(readers.fetchCloudMenuItems).toHaveBeenCalledWith("tenant-1");
    expect(readers.readLocalPlatos).not.toHaveBeenCalled();
    expect(readers.readLocalMirror).not.toHaveBeenCalled();

    expect(result.platos.map((p) => p.id)).toEqual([1, 2]);
    expect(result.platos[0].precio).toBe(350);
    expect(result.platos[1].disponible).toBe(true);
    expect(result.menuItems.map((mi) => mi.id)).toEqual(["mi-1"]);
    expect(result.settings).not.toBeNull();
  });

  it("web: rejects when the cloud returns an error instead of showing an empty menu", async () => {
    const readers = cloudReaders({
      fetchCloudPlatos: vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } }),
    });

    await expect(
      loadPublicMenuAdminSources({ tenantId: "tenant-1", sucursalId: null, localFirst: false, readers })
    ).rejects.toMatchObject({ message: "permission denied" });
  });

  it("desktop: reads from the local catalog and mirror without querying the cloud", async () => {
    const readers = cloudReaders({
      readLocalPlatos: vi.fn().mockResolvedValue([{ id: "1", nombre: "Burger", precio: 350, disponible: 1, va_a_cocina: 1, sucursal_id: null }]),
      readLocalMirror: vi.fn().mockImplementation((_tenantId: string, table: string) =>
        Promise.resolve(table === "digital_menu_settings" ? cloudSettings : cloudItems)
      ),
    });

    const result = await loadPublicMenuAdminSources({
      tenantId: "tenant-1",
      sucursalId: null,
      localFirst: true,
      readers,
    });

    expect(readers.fetchCloudPlatos).not.toHaveBeenCalled();
    expect(readers.fetchCloudMenuItems).not.toHaveBeenCalled();
    expect(readers.fetchCloudSettings).not.toHaveBeenCalled();
    expect(result.platos).toHaveLength(1);
    expect(result.platos[0].id).toBe(1);
    expect(result.menuItems.map((mi) => mi.id)).toEqual(["mi-1"]);
  });

  it("uses shouldReadLocalFirst to pick the path when localFirst is not given", async () => {
    vi.mocked(shouldReadLocalFirst).mockResolvedValue(false);
    const readers = cloudReaders();
    delete (readers as Record<string, unknown>).shouldReadLocalFirst;

    await loadPublicMenuAdminSources({ tenantId: "tenant-1", sucursalId: null, readers });

    expect(shouldReadLocalFirst).toHaveBeenCalled();
    expect(readers.fetchCloudPlatos).toHaveBeenCalled();
  });
});
