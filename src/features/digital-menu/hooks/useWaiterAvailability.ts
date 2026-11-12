import { useState, useEffect } from "react";
import { supabase } from "../../../shared/lib/supabase";
import { countOnlineWaiters, waiterPresenceChannelName } from "../lib/waiterPresence";

/**
 * Anonymous read-only subscription to waiter presence for public diners.
 *
 * Returns:
 * - `null` while unknown (initial load, disabled, or subscription error/timeout).
 * - `true` when at least one waiter is online.
 * - `false` when 0 waiters are online after sync.
 *
 * IMPORTANT: This hook NEVER calls `track()`.
 */
export function useWaiterAvailability(
  tenantId: string | null | undefined,
  enabled: boolean = true
): boolean | null {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled || !tenantId || tenantId.trim() === "") {
      setIsAvailable(null);
      return;
    }

    const channelName = waiterPresenceChannelName(tenantId);
    const channel = supabase.channel(channelName);

    const handlePresenceChange = () => {
      const state = channel.presenceState();
      const count = countOnlineWaiters(state as Record<string, unknown[]>);
      setIsAvailable(count > 0);
    };

    channel
      .on("presence", { event: "sync" }, handlePresenceChange)
      .on("presence", { event: "join" }, handlePresenceChange)
      .on("presence", { event: "leave" }, handlePresenceChange)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Fail open: presence is unreachable, return null (unknown), NOT false
          setIsAvailable(null);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, enabled]);

  return isAvailable;
}
