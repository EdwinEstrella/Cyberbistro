import { hasSqliteCycles } from "./cierresWrites";
import {
  decideCloseGuard,
  type CierreCloseGuardDecision,
} from "./cierreCloseGuard";
import type {
  ReconcileGhostCyclesResponse,
  CycleSyncStatusResponse,
} from "../../../shared/types/electron";

export const CLOSE_GUARD_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeoutPromise,
  ]);
}

/**
 * Adapter querying desktop SQLite IPC for on-demand ghost cycle reconcile
 * and cycle sync conflict status, then delegating to decideCloseGuard.
 * On non-desktop runtime (web), immediately proceeds.
 * Each IPC call is bounded by CLOSE_GUARD_TIMEOUT_MS to avoid hanging the cashier.
 */
export async function runCierreCloseGuard(
  currentCycleId: string,
): Promise<CierreCloseGuardDecision> {
  if (!hasSqliteCycles()) {
    return { action: "proceed" };
  }

  let reconcileResult: ReconcileGhostCyclesResponse | null = null;
  try {
    const reconcileCall = window.electronAPI?.reconcileGhostCycles?.();
    if (reconcileCall) {
      reconcileResult = await withTimeout<ReconcileGhostCyclesResponse>(
        reconcileCall,
        CLOSE_GUARD_TIMEOUT_MS,
        () => ({ ok: false, reason: "error" }),
      );
    }
  } catch {
    reconcileResult = { ok: false, reason: "error" };
  }

  let syncStatus: CycleSyncStatusResponse | null = null;
  try {
    const statusCall = window.electronAPI?.cycleSyncStatus?.(currentCycleId);
    if (statusCall) {
      syncStatus = await withTimeout<CycleSyncStatusResponse | null>(
        statusCall,
        CLOSE_GUARD_TIMEOUT_MS,
        () => null,
      );
    }
  } catch {
    syncStatus = null;
  }

  return decideCloseGuard({
    reconcileResult,
    currentCycleId,
    syncStatus,
  });
}
