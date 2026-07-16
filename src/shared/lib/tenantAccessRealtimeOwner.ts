export type TenantAccessRealtimePayload = {
  tenant_id?: string;
  activa?: boolean;
};

export interface TenantAccessRealtimeClient {
  connect: () => Promise<unknown>;
  subscribe: (channel: string) => Promise<{ ok?: boolean; error?: unknown } | undefined>;
  unsubscribe: (channel: string) => void | Promise<void>;
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
}

export interface TenantAccessRealtimeOwnerCallbacks {
  onState: (tenantId: string, active: boolean) => void;
  onReconnect: (tenantId: string) => void;
}

/** Sole owner of the auth/access channel; it remains subscribed while access is blocked. */
export class TenantAccessRealtimeOwner {
  private tenantId: string | null = null;
  private generation = 0;
  private subscribedChannel: string | null = null;
  private subscribeInFlight: Promise<void> | null = null;
  private teardownBarrier: Promise<void> = Promise.resolve();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onAccessEvent = (payload: unknown) => {
    const message = payload as TenantAccessRealtimePayload;
    if (!this.tenantId || message.tenant_id !== this.tenantId || typeof message.activa !== "boolean") return;
    this.callbacks.onState(this.tenantId, message.activa);
  };
  private readonly onConnected = () => {
    const tenantId = this.tenantId;
    if (tenantId) void this.subscribeCurrent(tenantId, this.generation, true);
  };

  constructor(
    private readonly client: TenantAccessRealtimeClient,
    private readonly callbacks: TenantAccessRealtimeOwnerCallbacks,
    private readonly reconcileMs = 60_000,
  ) {}

  start(tenantId: string): void {
    if (this.tenantId === tenantId) return;
    this.stop();
    this.tenantId = tenantId;
    const generation = ++this.generation;
    this.client.on("tenant_access_changed", this.onAccessEvent);
    this.client.on("connect", this.onConnected);
    this.reconcileTimer = setInterval(() => {
      if (this.tenantId === tenantId && this.generation === generation) {
        this.callbacks.onReconnect(tenantId);
      }
    }, this.reconcileMs);
    void this.subscribeCurrent(tenantId, generation, false, this.teardownBarrier);
  }

  stop(): void {
    this.generation += 1;
    this.client.off("tenant_access_changed", this.onAccessEvent);
    this.client.off("connect", this.onConnected);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    const channel = this.subscribedChannel;
    this.subscribedChannel = null;
    this.tenantId = null;
    if (channel) {
      this.teardownBarrier = this.teardownBarrier
        .then(() => this.client.unsubscribe(channel))
        .then(() => undefined);
    }
  }

  private async subscribeCurrent(tenantId: string, generation: number, reconnect: boolean, replacementBarrier?: Promise<void>): Promise<void> {
    if (this.subscribeInFlight) {
      await this.subscribeInFlight;
      if (reconnect && this.tenantId === tenantId && this.generation === generation) {
        this.callbacks.onReconnect(tenantId);
      }
      return;
    }
    const operation = this.subscribeCurrentUncoordinated(tenantId, generation, reconnect, replacementBarrier);
    this.subscribeInFlight = operation;
    try {
      await operation;
    } catch {
      // The reconciliation timer remains the bounded fallback while disconnected.
    } finally {
      if (this.subscribeInFlight === operation) this.subscribeInFlight = null;
    }
  }

  private async subscribeCurrentUncoordinated(tenantId: string, generation: number, reconnect: boolean, replacementBarrier?: Promise<void>): Promise<void> {
    if (replacementBarrier) await replacementBarrier;
    await this.client.connect();
    if (this.tenantId !== tenantId || this.generation !== generation) return;
    const channel = `tenant-access:${tenantId}`;
    const result = await this.client.subscribe(channel);
    if (this.tenantId !== tenantId || this.generation !== generation) return;
    if (result?.ok === false) return;
    this.subscribedChannel = channel;
    if (reconnect) this.callbacks.onReconnect(tenantId);
  }
}
