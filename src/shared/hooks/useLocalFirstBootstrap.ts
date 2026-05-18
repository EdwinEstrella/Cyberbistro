import { useEffect, useState } from "react";
import {
  bootstrapLocalFirstPhase,
  getLocalFirstStatusSnapshot,
  LOCAL_FIRST_HISTORY_TABLES,
  LOCAL_FIRST_IMMEDIATE_TABLES,
  isLocalFirstEnabled,
  pushOutboxToServer,
  revalidateLicenseOnReconnect,
  syncIncremental,
  type LocalFirstStatus,
} from "../lib/localFirst";

export function resolveLicenseGateForOnlineSync(validation: {
  valid: boolean;
  reason?: string;
}): { allowed: boolean; message: string | null } {
  if (validation.valid) {
    return { allowed: true, message: null };
  }

  return {
    allowed: false,
    message: validation.reason || "Licencia inválida. Reconectá para revalidar antes de sincronizar.",
  };
}

interface LocalFirstBootstrapState {
  status: LocalFirstStatus;
  message: string;
  completedHistoryTables: number;
  totalHistoryTables: number;
}

const EMPTY_STATE: LocalFirstBootstrapState = {
  status: "idle",
  message: "Esperando sesión del restaurante.",
  completedHistoryTables: 0,
  totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
};

export function useLocalFirstBootstrap(tenantId: string | null): LocalFirstBootstrapState {
  const [state, setState] = useState<LocalFirstBootstrapState>(EMPTY_STATE);

  useEffect(() => {
    if (!tenantId) {
      setState(EMPTY_STATE);
      return;
    }
    if (!isLocalFirstEnabled()) {
      setState({
        status: "idle",
        message: "Online: usando servidor como fuente de verdad.",
        completedHistoryTables: 0,
        totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
      });
      return;
    }

    let cancelled = false;
    const apply = (next: LocalFirstBootstrapState) => {
      if (!cancelled) setState(next);
    };

    const syncOnlineState = async () => {
      if (cancelled) return;
      const snapshot = await getLocalFirstStatusSnapshot(tenantId);
      if (navigator.onLine) {
        if (snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing") {
          const licenseValidation = await revalidateLicenseOnReconnect(tenantId);
          const licenseGate = resolveLicenseGateForOnlineSync(licenseValidation);
          if (!licenseGate.allowed) {
            apply({ ...snapshot, message: licenseGate.message || "Licencia inválida." });
            return;
          }

          apply({ ...snapshot, status: "syncing", message: "Sincronizando cambios..." });
          try {
            const outboxResult = await pushOutboxToServer(tenantId);
            const pullResult = await syncIncremental(tenantId);
            if (cancelled) return;
            const next = await getLocalFirstStatusSnapshot(tenantId);
            apply({
              ...next,
              message:
                next.status === "history_complete"
                  ? "Historial completo disponible offline."
                  : `Subidas ${outboxResult.pushed}, descargadas ${pullResult.rowsPulled} filas.`,
            });
          } catch {
            if (cancelled) return;
            const next = await getLocalFirstStatusSnapshot(tenantId);
            apply({ ...next, message: "Sincronizacion en background." });
          }
        } else {
          apply({ ...snapshot, message: "Conectado." });
        }
      } else {
        apply({
          status: "offline",
          message: "Offline: operando con la última foto local disponible.",
          completedHistoryTables: snapshot.completedHistoryTables,
          totalHistoryTables: snapshot.totalHistoryTables,
        });
      }
    };

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);

    const run = async () => {
      if (!navigator.onLine) {
        syncOnlineState();
        return;
      }

      try {
        const licenseValidation = await revalidateLicenseOnReconnect(tenantId);
        const licenseGate = resolveLicenseGateForOnlineSync(licenseValidation);
        if (!licenseGate.allowed) {
          apply({
            status: "error",
            message: licenseGate.message || "Licencia inválida.",
            completedHistoryTables: 0,
            totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
          });
          return;
        }

        const snapshot = await getLocalFirstStatusSnapshot(tenantId);
        if (snapshot.status === "history_complete") {
          apply({ ...snapshot, status: "syncing", message: "Sincronizando cambios..." });
          await syncOnlineState();
          return;
        }

        if (snapshot.status !== "ready_history_syncing") {
          apply({
            ...snapshot,
            status: "bootstrapping_minimum",
            message: "Preparando dataset mínimo local para operar.",
          });

          await bootstrapLocalFirstPhase({ tenantId, phase: "minimum", tables: LOCAL_FIRST_IMMEDIATE_TABLES });
        }
        if (cancelled) return;

        apply({
          status: "ready_history_syncing",
          message: "Listo para operar. Historial completo sincronizando en background.",
          completedHistoryTables: snapshot.completedHistoryTables,
          totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
        });

        void bootstrapLocalFirstPhase({
          tenantId,
          phase: "history",
          tables: LOCAL_FIRST_HISTORY_TABLES,
          onTableDone: async () => {
            const next = await getLocalFirstStatusSnapshot(tenantId);
            apply({
              ...next,
              message:
                next.status === "history_complete"
                  ? "Historial completo disponible offline."
                  : "Listo para operar. Historial completo sincronizando en background.",
            });
          },
        }).catch((err: unknown) => {
          if (!cancelled) {
            apply({
              status: "error",
              message: err instanceof Error ? err.message : "No se pudo completar el historial local.",
              completedHistoryTables: 0,
              totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
            });
          }
        });
      } catch (err) {
        apply({
          status: "error",
          message: err instanceof Error ? err.message : "No se pudo preparar la DB local.",
          completedHistoryTables: 0,
          totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, [tenantId]);

  return state;
}
