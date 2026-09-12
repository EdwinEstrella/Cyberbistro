import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

type RealtimeHandler = (payload: unknown) => void;
export type TenantRealtimeHandlers = Record<string, RealtimeHandler>;

interface ChannelEntry {
  channel: RealtimeChannel;
  consumers: Map<symbol, TenantRealtimeHandlers>;
  subscribed: Promise<boolean>;
}

export interface TenantRealtimeRegistration {
  ready: Promise<boolean>;
  release: () => void;
}

export class TenantRealtimeSubscriptionManager {
  private readonly channels = new Map<string, ChannelEntry>();

  constructor(private readonly client: SupabaseClient) {}

  acquire(topic: string, handlers: TenantRealtimeHandlers): TenantRealtimeRegistration {
    let entry = this.channels.get(topic);
    if (!entry) {
      const channel = this.client.channel(topic);
      entry = {
        channel,
        consumers: new Map(),
        subscribed: new Promise((resolve) => {
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              resolve(true);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              resolve(false);
              void this.client.removeChannel(channel);
            }
          });
        }),
      };
      this.channels.set(topic, entry);
    }

    const token = Symbol(topic);
    entry.consumers.set(token, handlers);
    for (const [event, handler] of Object.entries(handlers)) {
      entry.channel.on('broadcast', { event }, handler);
    }

    let released = false;
    return {
      ready: entry.subscribed,
      release: () => {
        if (released) return;
        released = true;
        const current = this.channels.get(topic);
        if (!current) return;
        current.consumers.delete(token);
        if (current.consumers.size === 0) {
          this.channels.delete(topic);
          void this.client.removeChannel(current.channel);
        }
      },
    };
  }
}

export const tenantRealtimeSubscriptionManager = new TenantRealtimeSubscriptionManager(supabase);
