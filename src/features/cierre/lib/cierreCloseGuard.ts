import type {
  ReconcileGhostCyclesResponse,
  CycleSyncStatusResponse,
} from "../../../shared/types/electron";

export interface DecideCloseGuardInput {
  reconcileResult?: ReconcileGhostCyclesResponse | null;
  currentCycleId: string;
  syncStatus?: CycleSyncStatusResponse | null;
}

export type CierreCloseGuardDecision =
  | { action: "proceed" }
  | { action: "stop"; message: string; reload: boolean };

export const MSG_CYCLE_AUTO_CLOSED =
  "Este ciclo no estaba registrado en la nube y se cerró automáticamente. No se imprimió nada.";

export const MSG_OPEN_PUSH_CONFLICT =
  "No se puede cerrar este ciclo: la nube no lo aceptó. Conéctate a internet y espera unos minutos; el sistema lo corrige solo.";

/**
 * Pure decision logic for guarding cycle close/print on desktop with SQLite cycles:
 * 1. If on-demand reconcile auto-closed the current cycle -> stop and trigger reload.
 * 2. If the current cycle has an unresolved open push conflict -> stop (do not close/print).
 * 3. Otherwise (including when reconcile returns ok: false for unavailable/error) -> proceed.
 */
export function decideCloseGuard(input: DecideCloseGuardInput): CierreCloseGuardDecision {
  if (input.reconcileResult?.ok === true && Array.isArray(input.reconcileResult.closed)) {
    const isCurrentClosed = input.reconcileResult.closed.some(
      (cycle) => cycle.id === input.currentCycleId,
    );
    if (isCurrentClosed) {
      return {
        action: "stop",
        message: MSG_CYCLE_AUTO_CLOSED,
        reload: true,
      };
    }
  }

  if (input.syncStatus?.openPushConflict === true) {
    return {
      action: "stop",
      message: MSG_OPEN_PUSH_CONFLICT,
      reload: false,
    };
  }

  return { action: "proceed" };
}
