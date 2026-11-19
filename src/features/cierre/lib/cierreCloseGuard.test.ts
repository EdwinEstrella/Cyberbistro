import { describe, expect, it } from "vitest";
import {
  decideCloseGuard,
  MSG_CYCLE_AUTO_CLOSED,
  MSG_OPEN_PUSH_CONFLICT,
} from "./cierreCloseGuard";

describe("decideCloseGuard", () => {
  const currentCycleId = "cycle-109";

  it("proceeds when reconcile fails ({ ok: false }) and there is no push conflict", () => {
    const decision = decideCloseGuard({
      reconcileResult: { ok: false, reason: "error" },
      currentCycleId,
      syncStatus: { openPushConflict: false },
    });

    expect(decision).toEqual({ action: "proceed" });
  });

  it("proceeds when reconcile is unavailable ({ ok: false, reason: 'unavailable' }) and no conflict", () => {
    const decision = decideCloseGuard({
      reconcileResult: { ok: false, reason: "unavailable" },
      currentCycleId,
      syncStatus: null,
    });

    expect(decision).toEqual({ action: "proceed" });
  });

  it("stops and requests reload when the current cycle id was closed by reconcile", () => {
    const decision = decideCloseGuard({
      reconcileResult: {
        ok: true,
        closed: [
          {
            id: currentCycleId,
            cycleNumber: 109,
            closedAt: "2026-09-19T20:00:00Z",
            supersededByCycleNumber: 110,
          },
        ],
      },
      currentCycleId,
      syncStatus: { openPushConflict: false },
    });

    expect(decision).toEqual({
      action: "stop",
      message: MSG_CYCLE_AUTO_CLOSED,
      reload: true,
    });
    if (decision.action === "stop") {
      expect(decision.message).toBe(
        "Este ciclo no estaba registrado en la nube y se cerró automáticamente. No se imprimió nada.",
      );
    }
  });

  it("stops with no reload when openPushConflict is true and reconcile did not close the current cycle", () => {
    const decision = decideCloseGuard({
      reconcileResult: { ok: true, closed: [] },
      currentCycleId,
      syncStatus: { openPushConflict: true },
    });

    expect(decision).toEqual({
      action: "stop",
      message: MSG_OPEN_PUSH_CONFLICT,
      reload: false,
    });
    if (decision.action === "stop") {
      expect(decision.message).toBe(
        "No se puede cerrar este ciclo: la nube no lo aceptó. Conéctate a internet y espera unos minutos; el sistema lo corrige solo.",
      );
    }
  });

  it("proceeds when reconcile closed a DIFFERENT cycle and there is no push conflict", () => {
    const decision = decideCloseGuard({
      reconcileResult: {
        ok: true,
        closed: [
          {
            id: "different-cycle-999",
            cycleNumber: 108,
            closedAt: "2026-09-19T18:00:00Z",
            supersededByCycleNumber: 110,
          },
        ],
      },
      currentCycleId,
      syncStatus: { openPushConflict: false },
    });

    expect(decision).toEqual({ action: "proceed" });
  });

  it("prioritizes current cycle auto-closed over push conflict if both occur", () => {
    const decision = decideCloseGuard({
      reconcileResult: {
        ok: true,
        closed: [
          {
            id: currentCycleId,
            cycleNumber: 109,
            closedAt: "2026-09-19T20:00:00Z",
            supersededByCycleNumber: 110,
          },
        ],
      },
      currentCycleId,
      syncStatus: { openPushConflict: true },
    });

    expect(decision).toEqual({
      action: "stop",
      message: MSG_CYCLE_AUTO_CLOSED,
      reload: true,
    });
  });

  it("proceeds when inputs are missing/empty", () => {
    expect(decideCloseGuard({ currentCycleId })).toEqual({ action: "proceed" });
  });
});
