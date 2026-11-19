import { useEffect } from "react";
import { toast } from "sonner";
import type { GhostCycleClosedItem } from "../../../shared/types/electron";

export function formatGhostCycleToastMessage(cycle: {
  cycleNumber: number | null;
  supersededByCycleNumber: number;
}): string {
  const cycleRef =
    cycle.cycleNumber != null
      ? `el ciclo #${cycle.cycleNumber}`
      : "un ciclo sin número";
  return `Se cerró automáticamente ${cycleRef} porque nunca llegó a la nube (lo reemplazó el ciclo #${cycle.supersededByCycleNumber}). Las ventas no se tocaron.`;
}

export function handleGhostCyclesClosedEvent(
  closedCycles: GhostCycleClosedItem[] | unknown,
): void {
  if (!Array.isArray(closedCycles) || closedCycles.length === 0) return;
  for (const cycle of closedCycles) {
    if (!cycle || typeof cycle !== "object") continue;
    toast.warning(
      formatGhostCycleToastMessage(
        cycle as { cycleNumber: number | null; supersededByCycleNumber: number },
      ),
    );
  }
}

/**
 * App-wide listener for ghost cycle auto-close events sent from the main process.
 * Emits a sonner warning toast for each closed cycle reported.
 */
export function useGhostCyclesToast(): void {
  useEffect(() => {
    const unbind = window.electronAPI?.onGhostCyclesClosed?.(
      handleGhostCyclesClosedEvent,
    );

    return () => {
      unbind?.();
    };
  }, []);
}
