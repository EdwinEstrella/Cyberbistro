import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../shared/lib/ordersUiAdapter", () => ({
  openOperatingCycle: vi.fn(async () => ({})),
  closeOperatingCycle: vi.fn(async () => ({})),
  markOperatingCyclePrinted: vi.fn(async () => ({})),
  discardOperatingCycle: vi.fn(async () => ({})),
}));
vi.mock("../../../shared/lib/localFirst", () => ({
  enqueueLocalWrite: vi.fn(async () => {}),
  getDeviceId: vi.fn(async () => "device-1"),
}));

import * as adapter from "../../../shared/lib/ordersUiAdapter";
import { enqueueLocalWrite } from "../../../shared/lib/localFirst";
import { writeCycleOpen, writeCycleClose, writeCycleDiscard, writeCyclePrinted } from "./cierresWrites";

const openInput = {
  tenantId: "tenant-1",
  sucursalId: "branch-1",
  cycleId: "cycle-1",
  cycleNumber: 5,
  businessDay: "2026-09-16",
  openedAtIso: "2026-09-16T10:00:00.000Z",
  efectivoInicial: 500,
  openedByAuthUserId: "user-1",
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("cierresWrites — single engine per runtime", () => {
  describe("desktop (SQLite bridge present)", () => {
    beforeEach(() => {
      vi.stubGlobal("window", { electronAPI: { executeOrdersCommand: vi.fn() } });
    });

    it("routes every cycle write through SQLite and never touches IndexedDB", async () => {
      await writeCycleOpen(openInput);
      await writeCycleClose({ tenantId: "tenant-1", cycleId: "cycle-1", closedAtIso: "2026-09-16T18:00:00.000Z" });
      await writeCycleDiscard({ tenantId: "tenant-1", cycleId: "cycle-1" });
      await writeCyclePrinted({ tenantId: "tenant-1", cycleId: "cycle-1", printedAtIso: "2026-09-16T18:01:00.000Z" });

      expect(adapter.openOperatingCycle).toHaveBeenCalledWith("cycle-1", "2026-09-16", 500, 5, "2026-09-16T10:00:00.000Z", "branch-1");
      expect(adapter.closeOperatingCycle).toHaveBeenCalledWith("cycle-1", "2026-09-16T18:00:00.000Z");
      expect(adapter.discardOperatingCycle).toHaveBeenCalledWith("cycle-1");
      expect(adapter.markOperatingCyclePrinted).toHaveBeenCalledWith("cycle-1", "2026-09-16T18:01:00.000Z");
      expect(enqueueLocalWrite).not.toHaveBeenCalled();
    });
  });

  describe("web (no SQLite bridge)", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {});
    });

    it("routes every cycle write through IndexedDB and never touches SQLite", async () => {
      await writeCycleOpen(openInput);
      await writeCycleClose({ tenantId: "tenant-1", cycleId: "cycle-1", closedAtIso: "2026-09-16T18:00:00.000Z" });
      await writeCycleDiscard({ tenantId: "tenant-1", cycleId: "cycle-1" });
      await writeCyclePrinted({ tenantId: "tenant-1", cycleId: "cycle-1", printedAtIso: "2026-09-16T18:01:00.000Z" });

      expect(adapter.openOperatingCycle).not.toHaveBeenCalled();
      expect(adapter.closeOperatingCycle).not.toHaveBeenCalled();
      expect(adapter.discardOperatingCycle).not.toHaveBeenCalled();
      expect(adapter.markOperatingCyclePrinted).not.toHaveBeenCalled();
      expect(enqueueLocalWrite).toHaveBeenCalledTimes(4);
      expect(enqueueLocalWrite).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "cierres_operativos",
        rowId: "cycle-1",
        op: "insert",
        payload: expect.objectContaining({ cycle_number: 5, opened_at: "2026-09-16T10:00:00.000Z", efectivo_inicial: 500 }),
      }));
    });
  });
});
