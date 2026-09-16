import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readLocalMirrorMock = vi.fn();
const shouldReadLocalFirstMock = vi.fn();

vi.mock("../src/shared/lib/localFirst", () => ({
  readLocalMirror: (...args: unknown[]) => readLocalMirrorMock(...args),
  shouldReadLocalFirst: (...args: unknown[]) => shouldReadLocalFirstMock(...args),
  getDeviceId: async () => "device-test",
  deleteLocalMirrorRow: async () => undefined,
  enqueueLocalWrite: async () => undefined,
}));

vi.mock("../src/shared/lib/supabase", () => ({ supabase: {} }));

// Force the cloud reconciliation to be skipped so the union is returned as-is.
vi.mock("../src/shared/lib/cloudAvailability", () => ({
  isDesktopCloudUnavailable: async () => true,
}));

import { listCustomers } from "../src/features/clientes/lib/customers";

function setSqliteCustomers(rows: Array<Record<string, unknown>> | null) {
  (globalThis as any).window = {
    electronAPI: rows === null ? {} : {
      listCustomers: vi.fn(async () => ({ ok: true, data: rows })),
    },
  };
}

beforeEach(() => {
  readLocalMirrorMock.mockReset();
  shouldReadLocalFirstMock.mockReset();
  readLocalMirrorMock.mockResolvedValue([]);
  shouldReadLocalFirstMock.mockResolvedValue(false);
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("listCustomers union (SQLite ∪ IndexedDB)", () => {
  it("unions SQLite (authoritative) with IndexedDB-only customers, SQLite winning collisions", async () => {
    setSqliteCustomers([
      { id: "shared", tenant_id: "t1", name: "Ana (SQLite)" },
      { id: "sqlite-only", tenant_id: "t1", name: "Beto" },
    ]);
    readLocalMirrorMock.mockResolvedValue([
      { id: "shared", tenant_id: "t1", name: "Ana (stale mirror)" },
      { id: "idb-only", tenant_id: "t1", name: "Carla" },
    ]);

    const rows = await listCustomers("t1");
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === "shared")?.name).toBe("Ana (SQLite)"); // SQLite wins
    expect(rows.some((r) => r.id === "idb-only")).toBe(true); // legacy customer preserved
    // Sorted by name asc: Ana, Beto, Carla.
    expect(rows.map((r) => r.id)).toEqual(["shared", "sqlite-only", "idb-only"]);
  });

  it("excludes soft-deleted customers from either store", async () => {
    setSqliteCustomers([
      { id: "a", tenant_id: "t1", name: "Activo" },
      { id: "d", tenant_id: "t1", name: "Borrado", deleted_at: "2026-01-01T00:00:00Z" },
    ]);
    readLocalMirrorMock.mockResolvedValue([
      { id: "m", tenant_id: "t1", name: "Mirror borrado", deleted_at: "2026-01-02T00:00:00Z" },
    ]);
    const rows = await listCustomers("t1");
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("ignores mirror rows from other tenants", async () => {
    setSqliteCustomers([{ id: "a", tenant_id: "t1", name: "Mío" }]);
    readLocalMirrorMock.mockResolvedValue([{ id: "x", tenant_id: "otro", name: "Ajeno" }]);
    const rows = await listCustomers("t1");
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("falls back to the mirror when the desktop bridge is unavailable", async () => {
    setSqliteCustomers(null); // electronAPI present but no listCustomers
    shouldReadLocalFirstMock.mockResolvedValue(true);
    readLocalMirrorMock.mockResolvedValue([{ id: "m1", tenant_id: "t1", name: "Solo IDB" }]);
    const rows = await listCustomers("t1");
    expect(rows.map((r) => r.id)).toEqual(["m1"]);
  });
});
