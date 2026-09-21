import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: vi.fn(async () => []),
  shouldReadLocalFirst: vi.fn(async () => false),
}));

import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { normalizeCierre, readLocalCierres } from "./cierresLocal";

const listCierres = vi.fn();

afterEach(() => {
  vi.clearAllMocks();
  delete (globalThis as any).window;
});

describe("normalizeCierre", () => {
  it("aliases opening_cash (SQLite) to efectivo_inicial", () => {
    expect(normalizeCierre({ id: 1, opening_cash: 500, cycle_number: 3 })).toMatchObject({
      id: "1",
      efectivo_inicial: 500,
      cycle_number: 3,
    });
  });

  it("keeps efectivo_inicial (IndexedDB mirror) when present", () => {
    expect(normalizeCierre({ id: "x", efectivo_inicial: 750, cycle_number: "4" })).toMatchObject({
      efectivo_inicial: 750,
      cycle_number: 4,
    });
  });

  it("coerces a string cycle_number to a number and defaults missing values to 0", () => {
    expect(normalizeCierre({ id: 9 })).toMatchObject({ efectivo_inicial: 0, cycle_number: 0 });
    expect(normalizeCierre({ id: 9, cycle_number: "12" }).cycle_number).toBe(12);
  });
});

describe("readLocalCierres", () => {
  beforeEach(() => {
    (globalThis as any).window = { electronAPI: { listCierres } };
  });

  it("returns SQLite rows normalized and sorted by cycle_number descending", async () => {
    listCierres.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, opening_cash: 100, cycle_number: 103 },
        { id: 2, opening_cash: 200, cycle_number: 105 },
        { id: 3, opening_cash: 300, cycle_number: 104 },
      ],
    });

    const rows = await readLocalCierres("t1");

    expect(rows.map((r) => r.cycle_number)).toEqual([105, 104, 103]);
    expect(rows[0]).toMatchObject({ id: "2", efectivo_inicial: 200 });
    // When SQLite is available the mirror is still merged (SQLite wins on id
    // collisions), so it is consulted rather than skipped.
    expect(readLocalMirror).toHaveBeenCalledWith("t1", "cierres_operativos");
  });

  it("SQLite wins on id collisions so a stale mirror never resurrects a lower cycle_number", async () => {
    listCierres.mockResolvedValue({ ok: true, data: [{ id: 1, opening_cash: 100, cycle_number: 105 }] });
    vi.mocked(readLocalMirror).mockResolvedValue([{ id: 1, efectivo_inicial: 100, cycle_number: 103 }] as any);

    const rows = await readLocalCierres("t1");

    expect(rows).toHaveLength(1);
    expect(rows[0].cycle_number).toBe(105);
  });

  it("merges mirror-only rows that SQLite did not return", async () => {
    listCierres.mockResolvedValue({ ok: true, data: [{ id: 1, opening_cash: 100, cycle_number: 105 }] });
    vi.mocked(readLocalMirror).mockResolvedValue([{ id: 2, efectivo_inicial: 200, cycle_number: 104 }] as any);

    const rows = await readLocalCierres("t1");

    expect(rows.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("filters by sucursal but keeps branch-less and main-process-default rows", async () => {
    listCierres.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, cycle_number: 5, sucursal_id: "suc1" },
        { id: 2, cycle_number: 4, sucursal_id: "suc2" },
        { id: 3, cycle_number: 3, sucursal_id: null },
        { id: 4, cycle_number: 2, sucursal_id: "main-process-default" },
      ],
    });

    const rows = await readLocalCierres("t1", { sucursalId: "suc1" });

    expect(rows.map((r) => r.id)).toEqual(["1", "3", "4"]);
  });

  it("applies the limit after sorting", async () => {
    listCierres.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, cycle_number: 1 },
        { id: 2, cycle_number: 3 },
        { id: 3, cycle_number: 2 },
      ],
    });

    const rows = await readLocalCierres("t1", { limit: 2 });

    expect(rows.map((r) => r.cycle_number)).toEqual([3, 2]);
  });

  it("falls back to the mirror only when local-first is allowed and the SQLite bridge is absent", async () => {
    delete (globalThis as any).window;
    vi.mocked(shouldReadLocalFirst).mockResolvedValue(true);
    vi.mocked(readLocalMirror).mockResolvedValue([{ id: 7, efectivo_inicial: 50, cycle_number: 9 }] as any);

    const rows = await readLocalCierres("t1");

    expect(shouldReadLocalFirst).toHaveBeenCalledWith("t1", ["cierres_operativos"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "7", cycle_number: 9 });
  });

  it("returns nothing when there is no SQLite bridge and local-first is disabled", async () => {
    delete (globalThis as any).window;
    vi.mocked(shouldReadLocalFirst).mockResolvedValue(false);

    const rows = await readLocalCierres("t1");

    expect(rows).toEqual([]);
    expect(readLocalMirror).not.toHaveBeenCalled();
  });
});
