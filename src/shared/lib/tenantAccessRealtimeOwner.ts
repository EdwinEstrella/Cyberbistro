export type TenantAccessRealtimePayload = {
  tenant_id?: string;
  activa?: boolean;
  user_id?: string;
  activo?: boolean;
  revoked?: boolean;
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
  onRevoked: (tenantId: string) => void;
  onReconnect: (tenantId: string) => void;
}

/** Sole auth/access owner. It keeps the tenant channel while suspended. */
export class TenantAccessRealtimeOwner {
  private tenantId: string | null = null;
  private userId: string | null = null;
  private generation = 0;
  private subscribedChannels = new Set<string>();
  private subscribeInFlight: Promise<void> | null = null;
  private teardownBarrier: Promise<void> = Promise.resolve();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  private readonly onAccessEvent = (payload: unknown) => {
    const message = payload as TenantAccessRealtimePayload;
    if (!this.tenantId || message.tenant_id !== this.tenantId) return;
    if (typeof message.activa === 'boolean') this.callbacks.onState(this.tenantId, message.activa);
  };

  private readonly onUserAccessEvent = (payload: unknown) => {
    const message = payload as TenantAccessRealtimePayload;
    if (!this.tenantId || !this.userId || message.user_id !== this.userId || message.tenant_id !== this.tenantId) return;
    if (message.revoked === true || message.activo === false) this.callbacks.onRevoked(this.tenantId);
  };

  private readonly onConnected = () => {
    const tenantId = this.tenantId;
    const userId = this.userId;
    if (tenantId && userId) void this.subscribeCurrent(tenantId, userId, this.generation, true, this.teardownBarrier);
  };

  constructor(
    private readonly client: TenantAccessRealtimeClient,
    private readonly callbacks: TenantAccessRealtimeOwnerCallbacks,
    private readonly reconcileMs = 60_000,
  ) {}

  start(tenantId: string, userId?: string | null): void {
    if (this.tenantId === tenantId && this.userId === (userId ?? null)) return;
    this.stop();
    this.tenantId = tenantId;
    this.userId = userId ?? null;
    const generation = ++this.generation;
    this.client.on('tenant_access_changed', this.onAccessEvent);
    this.client.on('tenant_user_access_changed', this.onUserAccessEvent);
    this.client.on('connect', this.onConnected);
    this.reconcileTimer = setInterval(() => {
      if (this.tenantId === tenantId && this.generation === generation) this.callbacks.onReconnect(tenantId);
    }, this.reconcileMs);
    void this.subscribeCurrent(tenantId, userId ?? null, generation, false, this.teardownBarrier);
  }

  stop(): void {
    this.generation += 1;
    this.client.off('tenant_access_changed', this.onAccessEvent);
    this.client.off('tenant_user_access_changed', this.onUserAccessEvent);
    this.client.off('connect', this.onConnected);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    const inFlight = this.subscribeInFlight;
    this.subscribeInFlight = null;
    const channels = [...this.subscribedChannels];
    this.subscribedChannels.clear();
    this.tenantId = null;
    this.userId = null;
    this.teardownBarrier = this.teardownBarrier
      .then(async () => {
        if (inFlight) await inFlight;
        for (const channel of channels) await this.client.unsubscribe(channel);
      })
      .then(() => undefined);
  }

  private async subscribeCurrent(
    tenantId: string,
    userId: string | null,
    generation: number,
    reconnect: boolean,
    replacementBarrier?: Promise<void>,
  ): Promise<void> {
    if (this.subscribeInFlight) {
      await this.subscribeInFlight;
      if (reconnect && this.tenantId === tenantId && this.generation === generation) this.callbacks.onReconnect(tenantId);
      return;
    }
    const operation = this.subscribeUncoordinated(tenantId, userId, generation, reconnect, replacementBarrier);
    this.subscribeInFlight = operation;
    try {
      await operation;
    } catch {
      // The bounded reconciliation timer remains active after connection failures.
    } finally {
      if (this.subscribeInFlight === operation) this.subscribeInFlight = null;
    }
  }

  private async subscribeUncoordinated(
    tenantId: string,
    userId: string | null,
    generation: number,
    reconnect: boolean,
    replacementBarrier?: Promise<void>,
  ): Promise<void> {
    if (replacementBarrier) await replacementBarrier;
    await this.client.connect();
    const channels = [`tenant-access:${tenantId}`, ...(userId ? [`tenant-access-user:${userId}`] : [])];
    for (const channel of channels) {
      const result = await this.client.subscribe(channel);
      const stale = this.tenantId !== tenantId || this.userId !== userId || this.generation !== generation;
      if (stale) {
        // This operation owns the subscription it just created. Clean up only
        // that generation; the replacement is serialized behind this await.
        if (result?.ok !== false) await this.client.unsubscribe(channel);
        continue;
      }
      if (result?.ok !== false) this.subscribedChannels.add(channel);
    }
    if (reconnect && this.tenantId === tenantId && this.generation === generation) this.callbacks.onReconnect(tenantId);
  }
}
