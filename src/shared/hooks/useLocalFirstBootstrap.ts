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
  ensureDefaultSucursal,
  assertCanWriteOffline,
} from "../lib/localFirst";
import {
  isCloudAvailabilityFailure,
  isDesktopRuntime,
  probeCloudAvailability,
  recordCloudFailure,
} from "../lib/cloudAvailability";
import { canContinueTenantWork, getTenantAccessGeneration } from "../lib/tenantAccessLifecycle";

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

export function canStartProtectedTenantWork(args: {
  tenantId: string | null;
  accessValidated: boolean;
}): boolean {
  return Boolean(args.tenantId && args.accessValidated);
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

export function useLocalFirstBootstrap(tenantId: string | null, accessValidated = true): LocalFirstBootstrapState {
  const [state, setState] = useState<LocalFirstBootstrapState>(EMPTY_STATE);

  useEffect(() => {
    if (!canStartProtectedTenantWork({ tenantId, accessValidated })) {
      setState(EMPTY_STATE);
      return;
    }
    const validatedTenantId = tenantId as string;
    const accessGeneration = getTenantAccessGeneration();
    const canContinue = () => !cancelled && canContinueTenantWork(validatedTenantId, accessGeneration);
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
      if (canContinue()) setState(next);
    };

    const syncOnlineState = async (force = false) => {
      if (!canContinue()) return;
      const snapshot = await getLocalFirstStatusSnapshot(validatedTenantId);
      if (!canContinue()) return;
      const cloudAvailable = await probeCloudAvailability(force);
      if (!canContinue()) return;
      if (navigator.onLine && cloudAvailable) {
        if (snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing") {
          const licenseValidation = await revalidateLicenseOnReconnect(validatedTenantId);
          if (!canContinue()) return;
          const licenseGate = resolveLicenseGateForOnlineSync(licenseValidation);
          if (!licenseGate.allowed) {
            apply({ ...snapshot, message: licenseGate.message || "Licencia inválida." });
            return;
          }

          if (snapshot.status !== "history_complete") {
            apply({ ...snapshot, status: "syncing", message: "Sincronizando cambios..." });
          }
          try {
            const outboxResult = await pushOutboxToServer(validatedTenantId);
            if (!canContinue()) return;
            const pullResult = await syncIncremental(validatedTenantId);
            if (!canContinue()) return;
            const next = await getLocalFirstStatusSnapshot(validatedTenantId);
            if (!canContinue()) return;
            apply({
              ...next,
              message:
                next.status === "history_complete"
                  ? "Historial completo disponible offline."
                  : `Subidas ${outboxResult.pushed}, descargadas ${pullResult.rowsPulled} filas.`,
            });
          } catch (err) {
            if (!canContinue()) return;
            const next = await getLocalFirstStatusSnapshot(validatedTenantId);
            if (!canContinue()) return;
            if (!isCloudAvailabilityFailure(err)) {
              apply({
                status: "error",
                message: err instanceof Error ? err.message : "No se pudo sincronizar con el servidor.",
                completedHistoryTables: next.completedHistoryTables,
                totalHistoryTables: next.totalHistoryTables,
              });
              return;
            }

            recordCloudFailure();
            apply({
              status: "offline",
              message: "Servidor no disponible: operando offline con datos locales.",
              completedHistoryTables: next.completedHistoryTables,
              totalHistoryTables: next.totalHistoryTables,
            });
          }
        } else {
          apply({ ...snapshot, message: "Conectado." });
        }
      } else {
        apply({
          status: "offline",
          message: navigator.onLine
            ? "Servidor no disponible: operando con la última foto local disponible."
            : "Offline: operando con la última foto local disponible.",
          completedHistoryTables: snapshot.completedHistoryTables,
          totalHistoryTables: snapshot.totalHistoryTables,
        });
      }
    };

    const handleOnline = () => { void syncOnlineState(true); };
    const handleOffline = () => { void syncOnlineState(true); };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const intervalId = window.setInterval(() => {
      void syncOnlineState(false);
    }, 15000);

    const run = async () => {
      if (!navigator.onLine) {
        void syncOnlineState(true);
        return;
      }

      if (isDesktopRuntime() && !(await probeCloudAvailability(false))) {
        if (!canContinue()) return;
        const snapshot = await getLocalFirstStatusSnapshot(validatedTenantId);
        if (!canContinue()) return;
        const localReady = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";
        const license = await assertCanWriteOffline(validatedTenantId);
        if (!canContinue()) return;
        if (localReady && license.valid) {
          apply({
            ...snapshot,
            status: "offline",
            message: "Servidor no disponible: iniciando con datos locales.",
          });
          return;
        }
      }

      try {
        const licenseValidation = await revalidateLicenseOnReconnect(validatedTenantId);
        if (!canContinue()) return;
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

        const snapshot = await getLocalFirstStatusSnapshot(validatedTenantId);
        if (!canContinue()) return;
        await ensureDefaultSucursal(validatedTenantId);
        if (!canContinue()) return;
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

          await bootstrapLocalFirstPhase({ tenantId: validatedTenantId, phase: "minimum", tables: LOCAL_FIRST_IMMEDIATE_TABLES, shouldContinue: canContinue });
        }
        if (!canContinue()) return;

        apply({
          status: "ready_history_syncing",
          message: "Listo para operar. Historial completo sincronizando en background.",
          completedHistoryTables: snapshot.completedHistoryTables,
          totalHistoryTables: LOCAL_FIRST_HISTORY_TABLES.length,
        });

        void bootstrapLocalFirstPhase({
          tenantId: validatedTenantId,
          phase: "history",
          tables: LOCAL_FIRST_HISTORY_TABLES,
          shouldContinue: canContinue,
          onTableDone: async () => {
            const next = await getLocalFirstStatusSnapshot(validatedTenantId);
            if (!canContinue()) return;
            apply({
              ...next,
              message:
                next.status === "history_complete"
                  ? "Historial completo disponible offline."
                  : "Listo para operar. Historial completo sincronizando en background.",
            });
          },
        }).catch(async (err: unknown) => {
          if (canContinue()) {
            if (isDesktopRuntime() && !(await probeCloudAvailability(false))) {
              if (!canContinue()) return;
              const next = await getLocalFirstStatusSnapshot(validatedTenantId);
              if (!canContinue()) return;
              apply({
                ...next,
                status: "offline",
                message: "Servidor no disponible: historial local pendiente de sincronizar.",
              });
              return;
            }
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
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(intervalId);
    };
  }, [tenantId, accessValidated]);

  return state;
}
