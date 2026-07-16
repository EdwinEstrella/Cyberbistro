import { insforgeClient } from "./insforge";

type RealtimeHandler = (payload: unknown) => void;

export interface TenantRealtimeClient {
  connect: () => Promise<unknown>;
  subscribe: (channel: string) => Promise<{ ok?: boolean; error?: unknown } | undefined>;
  unsubscribe: (channel: string) => void | Promise<void>;
  on: (event: string, handler: RealtimeHandler) => void;
  off: (event: string, handler: RealtimeHandler) => void;
}

export type TenantRealtimeHandlers = Record<string, RealtimeHandler>;

interface Consumer {
  handlers: TenantRealtimeHandlers;
  attached: boolean;
}

interface ChannelEntry {
  consumers: Map<symbol, Consumer>;
  subscribed: boolean;
  unsubscribed: boolean;
  setup: Promise<void>;
  teardown: Promise<void>;
}

export interface TenantRealtimeRegistration {
  ready: Promise<boolean>;
  release: () => void;
}

export class TenantRealtimeSubscriptionManager {
  private readonly channels = new Map<string, ChannelEntry>();
  private readonly lastReleased = new Map<string, ChannelEntry>();

  constructor(private readonly client: TenantRealtimeClient) {}

  acquire(channel: string, handlers: TenantRealtimeHandlers): TenantRealtimeRegistration {
    let entry = this.channels.get(channel);
    if (!entry) {
      const retired = this.lastReleased.get(channel);
      this.lastReleased.delete(channel);
      entry = {
        consumers: new Map(),
        subscribed: false,
        unsubscribed: false,
        setup: Promise.resolve(),
        teardown: retired?.teardown ?? Promise.resolve(),
      };
      this.channels.set(channel, entry);
      entry.setup = this.setupChannel(channel, entry, retired?.teardown);
    }

    const token = Symbol(channel);
    entry.consumers.set(token, { handlers, attached: false });
    void entry.setup.then(() => this.attachConsumer(channel, entry!, token));

    let released = false;
    return {
      ready: entry.setup.then(() => entry!.subscribed && !released),
      release: () => {
        if (released) return;
        released = true;
        this.release(channel, entry!, token);
      },
    };
  }

  private async setupChannel(channel: string, entry: ChannelEntry, replacementBarrier?: Promise<void>): Promise<void> {
    try {
      if (replacementBarrier) await replacementBarrier;
      await this.client.connect();
      if (!this.isCurrent(channel, entry) || entry.consumers.size === 0) return;

      const result = await this.client.subscribe(channel);
      if (result?.ok === false) return;

      entry.subscribed = true;

      // The last consumer may have released while subscribe was in flight. Teardown
      // is serialized through entry.teardown so a replacement cannot subscribe
      // before this global SDK channel is fully unsubscribed.
      if (!this.isCurrent(channel, entry) || entry.consumers.size === 0) {
        return;
      }

      for (const token of entry.consumers.keys()) this.attachConsumer(channel, entry, token);
    } catch {
      // The consumer remains mounted; the next validated effect can retry.
    }
  }

  private attachConsumer(channel: string, entry: ChannelEntry, token: symbol): void {
    if (!this.isCurrent(channel, entry) || !entry.subscribed) return;
    const consumer = entry.consumers.get(token);
    if (!consumer || consumer.attached) return;
    for (const [event, handler] of Object.entries(consumer.handlers)) this.client.on(event, handler);
    consumer.attached = true;
  }

  private release(channel: string, entry: ChannelEntry, token: symbol): void {
    const consumer = entry.consumers.get(token);
    if (!consumer) return;
    if (consumer.attached) {
      for (const [event, handler] of Object.entries(consumer.handlers)) this.client.off(event, handler);
    }
    entry.consumers.delete(token);
    if (entry.consumers.size === 0) {
      this.channels.delete(channel);
      this.lastReleased.set(channel, entry);
      entry.teardown = entry.setup.then(() =>
        entry.subscribed ? this.unsubscribeOnce(channel, entry) : undefined,
      );
    }
  }

  private isCurrent(channel: string, entry: ChannelEntry): boolean {
    return this.channels.get(channel) === entry;
  }

  private async unsubscribeOnce(channel: string, entry: ChannelEntry): Promise<void> {
    if (entry.unsubscribed) return;
    entry.unsubscribed = true;
    await this.client.unsubscribe(channel);
  }
}

export const tenantRealtimeSubscriptionManager = new TenantRealtimeSubscriptionManager(
  (insforgeClient as unknown as TenantRealtimeClient),
);
