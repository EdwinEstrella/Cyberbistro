import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  formatGhostCycleToastMessage,
  handleGhostCyclesClosedEvent,
} from "./useGhostCyclesToast";

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

describe("Ghost cycles toast notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatGhostCycleToastMessage", () => {
    it("formats message with cycle number when cycleNumber is provided", () => {
      const msg = formatGhostCycleToastMessage({
        cycleNumber: 109,
        supersededByCycleNumber: 110,
      });
      expect(msg).toBe(
        "Se cerró automáticamente el ciclo #109 porque nunca llegó a la nube (lo reemplazó el ciclo #110). Las ventas no se tocaron.",
      );
    });

    it("formats message with 'un ciclo sin número' when cycleNumber is null", () => {
      const msg = formatGhostCycleToastMessage({
        cycleNumber: null,
        supersededByCycleNumber: 2,
      });
      expect(msg).toBe(
        "Se cerró automáticamente un ciclo sin número porque nunca llegó a la nube (lo reemplazó el ciclo #2). Las ventas no se tocaron.",
      );
    });
  });

  describe("handleGhostCyclesClosedEvent", () => {
    it("calls toast.warning with exact Spanish text for closed cycle", () => {
      handleGhostCyclesClosedEvent([
        {
          cycleNumber: 15,
          closedAt: "2026-09-19T20:00:00Z",
          supersededByCycleNumber: 16,
        },
      ]);

      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith(
        "Se cerró automáticamente el ciclo #15 porque nunca llegó a la nube (lo reemplazó el ciclo #16). Las ventas no se tocaron.",
      );
    });

    it("calls toast.warning with exact Spanish text when cycleNumber is null", () => {
      handleGhostCyclesClosedEvent([
        {
          cycleNumber: null,
          closedAt: "2026-09-19T20:00:00Z",
          supersededByCycleNumber: 42,
        },
      ]);

      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith(
        "Se cerró automáticamente un ciclo sin número porque nunca llegó a la nube (lo reemplazó el ciclo #42). Las ventas no se tocaron.",
      );
    });

    it("calls toast.warning once per closed cycle when multiple cycles are closed in one event", () => {
      handleGhostCyclesClosedEvent([
        { cycleNumber: 1, closedAt: "2026-09-19T10:00:00Z", supersededByCycleNumber: 3 },
        { cycleNumber: 2, closedAt: "2026-09-19T11:00:00Z", supersededByCycleNumber: 3 },
      ]);

      expect(toast.warning).toHaveBeenCalledTimes(2);
      expect(toast.warning).toHaveBeenNthCalledWith(
        1,
        "Se cerró automáticamente el ciclo #1 porque nunca llegó a la nube (lo reemplazó el ciclo #3). Las ventas no se tocaron.",
      );
      expect(toast.warning).toHaveBeenNthCalledWith(
        2,
        "Se cerró automáticamente el ciclo #2 porque nunca llegó a la nube (lo reemplazó el ciclo #3). Las ventas no se tocaron.",
      );
    });

    it("does not call toast when payload is empty or invalid", () => {
      handleGhostCyclesClosedEvent([]);
      handleGhostCyclesClosedEvent(null);
      handleGhostCyclesClosedEvent(undefined);
      handleGhostCyclesClosedEvent("invalid" as any);

      expect(toast.warning).not.toHaveBeenCalled();
    });
  });
});
