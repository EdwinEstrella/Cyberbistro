import { useEffect } from "react";
import { tenantRealtimeSubscriptionManager } from "../../shared/lib/tenantRealtimeSubscriptionManager";

/** `tenant_id` que envían los triggers SQL. */
function payloadTenantId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const tid = (payload as { tenant_id?: unknown }).tenant_id;
  return typeof tid === "string" ? tid : undefined;
}

function isPayloadForTenant(payload: unknown, tenantId: string): boolean {
  return payloadTenantId(payload) === tenantId;
}

export function useCocinaRealtimeSync(
  tenantId: string | null,
  onComandasDirty: () => void | Promise<void>,
  onCocinaActivaFromPayload?: (activa: boolean) => void,
  onNewComandaReceived?: (
    payload: { id: string; tenant_id: string; estado?: string },
    eventType: "INSERT" | "UPDATE"
  ) => void,
  accessValidated = true,
) {
  useEffect(() => {
    if (!tenantId || !accessValidated) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleComandasRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (cancelled) return;
        void Promise.resolve(onComandasDirty());
      }, 200);
    };

    const handleInsertEvent = (payload: unknown) => {
      if (cancelled || !isPayloadForTenant(payload, tenantId)) return;
      scheduleComandasRefetch();
      if (onNewComandaReceived) {
        const p = payload as { id?: string; tenant_id?: string; estado?: string };
        if (p.id && p.tenant_id) onNewComandaReceived({ id: p.id, tenant_id: p.tenant_id, estado: p.estado }, "INSERT");
      }
    };

    const handleUpdateEvent = (payload: unknown) => {
      if (cancelled || !isPayloadForTenant(payload, tenantId)) return;
      scheduleComandasRefetch();
      if (onNewComandaReceived) {
        const p = payload as { id?: string; tenant_id?: string; estado?: string };
        if (p.id && p.tenant_id) onNewComandaReceived({ id: p.id, tenant_id: p.tenant_id, estado: p.estado }, "UPDATE");
      }
    };

    const handleDeleteEvent = (payload: unknown) => {
      if (cancelled || !isPayloadForTenant(payload, tenantId)) return;
      scheduleComandasRefetch();
    };

    const onCocinaEstadoEvent = (payload: unknown) => {
      if (cancelled || !onCocinaActivaFromPayload || !isPayloadForTenant(payload, tenantId)) return;
      const p = payload as { activa?: boolean };
      if (typeof p.activa === "boolean") onCocinaActivaFromPayload(p.activa);
    };

    const registration = tenantRealtimeSubscriptionManager.acquire(`cocina:${tenantId}`, {
      INSERT_comanda: handleInsertEvent,
      UPDATE_comanda: handleUpdateEvent,
      DELETE_comanda: handleDeleteEvent,
      UPDATE_cocina_estado: onCocinaEstadoEvent,
    });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      registration.release();
    };
  }, [tenantId, accessValidated, onComandasDirty, onCocinaActivaFromPayload, onNewComandaReceived]);
}
