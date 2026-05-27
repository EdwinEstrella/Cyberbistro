import { useEffect } from "react";
import { insforgeClient } from "../../shared/lib/insforge";

/** Subconjunto del cliente realtime de @insforge/sdk (evita depender de tipos exportados). */
type InsforgeRealtime = {
  connect: () => Promise<void>;
  subscribe: (
    channel: string
  ) => Promise<{ ok: boolean; error?: { message?: string } }>;
  unsubscribe: (channel: string) => void;
  on: (event: string, fn: (payload: unknown) => void) => void;
  off: (event: string, fn: (payload: unknown) => void) => void;
};

function getRealtime(): InsforgeRealtime | undefined {
  return (insforgeClient as { realtime?: InsforgeRealtime }).realtime;
}

/** `tenant_id` que envían los triggers SQL (defensa en profundidad frente a mensajes cruzados). */
function payloadTenantId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const tid = (payload as { tenant_id?: unknown }).tenant_id;
  return typeof tid === "string" ? tid : undefined;
}

function isPayloadForTenant(payload: unknown, tenantId: string): boolean {
  const tid = payloadTenantId(payload);
  if (!tid) return false;
  return tid === tenantId;
}

/**
 * Suscripción solo al canal `cocina:{tenantId}` del negocio de la sesión (InsForge Auth + tenant_users).
 *
 * Multitenant:
 * - Los triggers publican en `cocina:` || tenant_id de la **fila en BD**, no en datos del cliente.
 * - Solo nos suscribimos al UUID del tenant logueado.
 * - Ignoramos cualquier evento cuyo `tenant_id` en payload no coincida (por si hubiera fugas en red).
 *
 * Para impedir que un cliente malicioso se suscriba al canal de otro negocio, activá RLS en
 * `realtime.channels` (ver `db/insforge-realtime-cocina-rls.sql`).
 */
export function useCocinaRealtimeSync(
  tenantId: string | null,
  onComandasDirty: () => void | Promise<void>,
  onCocinaActivaFromPayload?: (activa: boolean) => void,
  onNewComandaReceived?: (
    payload: { id: string; tenant_id: string; estado?: string },
    eventType: "INSERT" | "UPDATE"
  ) => void
) {
  useEffect(() => {
    if (!tenantId) return;

    const rt = getRealtime();
    if (!rt) return;

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
      if (!isPayloadForTenant(payload, tenantId)) return;
      scheduleComandasRefetch();

      if (onNewComandaReceived) {
        const p = payload as { id?: string; tenant_id?: string; estado?: string };
        if (p.id && p.tenant_id) {
          onNewComandaReceived({ id: p.id, tenant_id: p.tenant_id, estado: p.estado }, "INSERT");
        }
      }
    };

    const handleUpdateEvent = (payload: unknown) => {
      if (!isPayloadForTenant(payload, tenantId)) return;
      scheduleComandasRefetch();

      if (onNewComandaReceived) {
        const p = payload as { id?: string; tenant_id?: string; estado?: string };
        if (p.id && p.tenant_id) {
          onNewComandaReceived({ id: p.id, tenant_id: p.tenant_id, estado: p.estado }, "UPDATE");
        }
      }
    };

    const handleDeleteEvent = (payload: unknown) => {
      if (!isPayloadForTenant(payload, tenantId)) return;
      scheduleComandasRefetch();
    };

    const onCocinaEstadoEvent = (payload: unknown) => {
      if (cancelled || !onCocinaActivaFromPayload) return;
      if (!isPayloadForTenant(payload, tenantId)) return;
      const p = payload as { activa?: boolean };
      if (typeof p.activa === "boolean") {
        onCocinaActivaFromPayload(p.activa);
      }
    };

    const channel = `cocina:${tenantId}`;

    void (async () => {
      try {
        await rt.connect();
        const sub = await rt.subscribe(channel);
        if (!sub.ok) {
          console.warn("[Cocina] Realtime subscribe:", sub.error?.message);
          return;
        }
        if (cancelled) return;

        rt.on("INSERT_comanda", handleInsertEvent);
        rt.on("UPDATE_comanda", handleUpdateEvent);
        rt.on("DELETE_comanda", handleDeleteEvent);
        rt.on("UPDATE_cocina_estado", onCocinaEstadoEvent);
      } catch (e) {
        console.warn("[Cocina] Realtime connect failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      rt.off("INSERT_comanda", handleInsertEvent);
      rt.off("UPDATE_comanda", handleUpdateEvent);
      rt.off("DELETE_comanda", handleDeleteEvent);
      rt.off("UPDATE_cocina_estado", onCocinaEstadoEvent);
      rt.unsubscribe(channel);
    };
  }, [tenantId, onComandasDirty, onCocinaActivaFromPayload]);
}
