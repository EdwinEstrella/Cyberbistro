import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../shared/lib/supabase";
import { isDesktopCloudUnavailable } from "../../../shared/lib/cloudAvailability";
import { tenantRealtimeSubscriptionManager } from "../../../shared/lib/tenantRealtimeSubscriptionManager";
import {
  applyServiceRequestEvent,
  parseServiceAlertRow,
  shouldPlayAlertSound,
  shouldRemoveAfterAttend,
  sortServiceAlerts,
  type ServiceAlert,
} from "../lib/serviceAlerts";
import { playServiceAlertSound } from "../lib/alertSound";

export interface UseServiceRequestAlertsOptions {
  tenantId: string | null | undefined;
  enabled: boolean;
}

export interface UseServiceRequestAlertsReturn {
  alerts: ServiceAlert[];
  attend: (id: string) => Promise<void>;
  attendingId: string | null;
  error: string | null;
}

export function useServiceRequestAlerts({
  tenantId,
  enabled,
}: UseServiceRequestAlertsOptions): UseServiceRequestAlertsReturn {
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [attendingId, setAttendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the latest alerts to compute shouldPlayAlertSound without stale closures
  const alertsRef = useRef<ServiceAlert[]>(alerts);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const loadAlerts = useCallback(async () => {
    if (!enabled || !tenantId) return;

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const cloudDown = await isDesktopCloudUnavailable().catch(() => false);
      if (cloudDown) return;

      const { data, error: fetchError } = await supabase
        .from("service_requests")
        .select("id,tenant_id,sucursal_id,mesa_numero,kind,status,created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "pending");

      if (fetchError) {
        setError("No se pudieron cargar las solicitudes de mesas.");
        return;
      }

      if (Array.isArray(data)) {
        const parsed: ServiceAlert[] = [];
        for (const row of data) {
          const alert = parseServiceAlertRow(row);
          if (alert) parsed.push(alert);
        }
        setAlerts(sortServiceAlerts(parsed));
        setError(null);
      }
    } catch (err) {
      console.error("[useServiceRequestAlerts] Error loading pending requests:", err);
      setError("No se pudieron cargar las solicitudes de mesas.");
    }
  }, [enabled, tenantId]);

  useEffect(() => {
    if (!enabled || !tenantId) {
      setAlerts([]);
      setError(null);
      return;
    }

    let cancelled = false;

    // Initial load
    void loadAlerts();

    // Reconcile missed events when tab returns to focus
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadAlerts();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    const rtChannel = `service_requests:${tenantId}`;

    const handleInsert = (payload: unknown) => {
      if (cancelled) return;
      const p = payload as { tenant_id?: string } | null;
      if (p?.tenant_id && p.tenant_id !== tenantId) return;

      if (shouldPlayAlertSound("INSERT", payload, alertsRef.current)) {
        playServiceAlertSound();
      }
      setAlerts((prev) => applyServiceRequestEvent(prev, "INSERT", payload));
    };

    const handleUpdate = (payload: unknown) => {
      if (cancelled) return;
      const p = payload as { tenant_id?: string } | null;
      if (p?.tenant_id && p.tenant_id !== tenantId) return;

      setAlerts((prev) => applyServiceRequestEvent(prev, "UPDATE", payload));
    };

    const handleDelete = (payload: unknown) => {
      if (cancelled) return;
      const p = payload as { tenant_id?: string } | null;
      if (p?.tenant_id && p.tenant_id !== tenantId) return;

      setAlerts((prev) => applyServiceRequestEvent(prev, "DELETE", payload));
    };

    let registration: ReturnType<typeof tenantRealtimeSubscriptionManager.acquire> | null = null;

    void (async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const cloudDown = await isDesktopCloudUnavailable().catch(() => false);
      if (cloudDown || cancelled) return;

      registration = tenantRealtimeSubscriptionManager.acquire(
        rtChannel,
        {
          INSERT_service_request: handleInsert,
          UPDATE_service_request: handleUpdate,
          DELETE_service_request: handleDelete,
        },
        (status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            void loadAlerts();
          }
        }
      );

      void registration.ready
        .then((ok) => {
          if (ok && !cancelled) {
            void loadAlerts();
          }
        })
        .catch((e: unknown) => {
          console.warn("[useServiceRequestAlerts] Realtime connect failed:", e);
        });
    })();

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      registration?.release();
    };
  }, [enabled, tenantId, loadAlerts]);

  const attend = useCallback(
    async (id: string) => {
      if (!enabled || !tenantId || !id) return;
      if (attendingId !== null) return; // Prevent double click while attending

      setAttendingId(id);
      try {
        const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: null }));
        const userId = userData?.user?.id ?? null;

        const { data, error: updateError } = await supabase
          .from("service_requests")
          .update({
            status: "attended",
            attended_at: new Date().toISOString(),
            attended_by: userId,
          })
          .eq("id", id)
          .eq("status", "pending")
          .select("id");

        if (updateError) {
          setError("No se pudo marcar como atendida. Intentá de nuevo.");
          return;
        }

        if (shouldRemoveAfterAttend(data)) {
          setAlerts((prev) => prev.filter((a) => a.id !== id));
          setError(null);
        } else {
          setError(null);
          await loadAlerts();
        }
      } catch (err) {
        console.error("[useServiceRequestAlerts] Attend request failed:", err);
        setError("No se pudo marcar como atendida. Intentá de nuevo.");
      } finally {
        setAttendingId(null);
      }
    },
    [enabled, tenantId, attendingId, loadAlerts]
  );

  return {
    alerts,
    attend,
    attendingId,
    error,
  };
}
