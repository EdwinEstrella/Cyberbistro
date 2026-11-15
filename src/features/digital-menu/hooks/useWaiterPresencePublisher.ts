import { useEffect, useRef } from "react";
import { supabase } from "../../../shared/lib/supabase";
import { isWaiterPresenceRole, waiterPresenceChannelName } from "../lib/waiterPresence";

function generateTabPresenceKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Staff-side hook to broadcast staff presence on the tenant's waiter channel.
 *
 * Requirements:
 * - Only active if enabled, tenantId is present, and role is in WAITER_PRESENCE_ROLES.
 * - Random per-tab key in presence config.
 * - Broadcasts only `{ role, at }` with NO personal data (no email, name, user id).
 * - Tracks after SUBSCRIBED status.
 * - Cleans up on unmount with untrack and removeChannel.
 */
export function useWaiterPresencePublisher(
  tenantId: string | null | undefined,
  rol: string | null | undefined,
  enabled: boolean
): void {
  const tabKeyRef = useRef<string>(generateTabPresenceKey());

  useEffect(() => {
    if (!enabled || !tenantId || tenantId.trim() === "" || !isWaiterPresenceRole(rol)) {
      return;
    }

    const channelName = waiterPresenceChannelName(tenantId);
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: tabKeyRef.current,
        },
      },
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({
            role: rol,
            at: Date.now(),
          });
        } catch {
          // Ignore track errors during unmount or socket close
        }
      }
    });

    return () => {
      void channel.untrack().catch(() => {});
      void supabase.removeChannel(channel);
    };
  }, [tenantId, rol, enabled]);
}
