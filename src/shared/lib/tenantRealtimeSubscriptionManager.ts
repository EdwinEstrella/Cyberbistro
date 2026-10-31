import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

type RealtimeHandler = (payload: unknown) => void;
export type TenantRealtimeHandlers = Record<string, RealtimeHandler>;
export type RealtimeStatusCallback = (status: string) => void;

interface ChannelEntry {
  channel: RealtimeChannel;
  consumers: Map<symbol, TenantRealtimeHandlers>;
  statusListeners: Map<symbol, RealtimeStatusCallback>;
  lastStatus: string | null;
  subscribed: Promise<boolean>;
}

export interface TenantRealtimeRegistration {
  ready: Promise<boolean>;
  release: () => void;
}

export class TenantRealtimeSubscriptionManager {
  private readonly channels = new Map<string, ChannelEntry>();

  constructor(private readonly client: SupabaseClient) {}

  acquire(
    topic: string,
    handlers: TenantRealtimeHandlers,
    onStatusChange?: RealtimeStatusCallback
  ): TenantRealtimeRegistration {
    let entry = this.channels.get(topic);
    if (!entry) {
      const channel = this.client.channel(topic);
      const consumers = new Map<symbol, TenantRealtimeHandlers>();
      const statusListeners = new Map<symbol, RealtimeStatusCallback>();

      channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const current = this.channels.get(topic);
        if (!current) return;
        for (const handlerMap of current.consumers.values()) {
          handlerMap['postgres_changes']?.(payload);
          handlerMap['*']?.(payload);
        }
      });

      channel.on('broadcast', { event: '*' }, (payload: any) => {
        const current = this.channels.get(topic);
        if (!current) return;
        const ev = payload?.event;
        for (const handlerMap of current.consumers.values()) {
          if (ev && handlerMap[ev]) handlerMap[ev](payload?.payload ?? payload);
          handlerMap['*']?.(payload);
        }
      });

      const subscribed = new Promise<boolean>((resolve) => {
        channel.subscribe((status) => {
          if (entry) {
            entry.lastStatus = status;
            for (const listener of Array.from(entry.statusListeners.values())) {
              try {
                listener(status);
              } catch (err) {
                console.error('[TenantRealtimeSubscriptionManager] status listener error:', err);
              }
            }
          }
          if (status === 'SUBSCRIBED') {
            resolve(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve(false);
            void this.client.removeChannel(channel);
          }
        });
      });

      entry = {
        channel,
        consumers,
        statusListeners,
        lastStatus: null,
        subscribed,
      };

      this.channels.set(topic, entry);
    }

    const token = Symbol(topic);
    entry.consumers.set(token, handlers);
    if (onStatusChange) {
      entry.statusListeners.set(token, onStatusChange);
      if (entry.lastStatus) {
        try {
          onStatusChange(entry.lastStatus);
        } catch (err) {
          console.error('[TenantRealtimeSubscriptionManager] initial status listener error:', err);
        }
      }
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
        current.statusListeners.delete(token);
        if (current.consumers.size === 0) {
          this.channels.delete(topic);
          void this.client.removeChannel(current.channel);
        }
      },
    };
  }

  getChannelStatus(topic: string): string | null {
    return this.channels.get(topic)?.lastStatus ?? null;
  }

  broadcast(topic: string, event: string, payload: unknown): void {
    const entry = this.channels.get(topic);
    if (entry) {
      void entry.channel.send({ type: 'broadcast', event, payload });
    }
  }
}

export const tenantRealtimeSubscriptionManager = new TenantRealtimeSubscriptionManager(supabase);
