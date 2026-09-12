import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface TenantAccessRealtimeOwnerCallbacks {
  onState: (tenantId: string, active: boolean) => void;
  onRevoked: (tenantId: string) => void;
  onReconnect: (tenantId: string) => void;
}

/** Owns native Supabase broadcast channels for tenant access changes. */
export class TenantAccessRealtimeOwner {
  private channels: RealtimeChannel[] = [];
  private tenantId: string | null = null;
  private userId: string | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly client: SupabaseClient,
    private readonly callbacks: TenantAccessRealtimeOwnerCallbacks,
    private readonly reconcileMs = 60_000,
  ) {}

  start(tenantId: string, userId?: string | null): void {
    if (this.tenantId === tenantId && this.userId === (userId ?? null)) return;
    this.stop();
    this.tenantId = tenantId;
    this.userId = userId ?? null;

    const tenantChannel = this.client.channel(`tenant-access:${tenantId}`)
      .on('broadcast', { event: 'tenant_access_changed' }, ({ payload }) => {
        const active = (payload as { activa?: unknown }).activa;
        if (typeof active === 'boolean') this.callbacks.onState(tenantId, active);
      });
    this.channels.push(tenantChannel);

    if (userId) {
      const userChannel = this.client.channel(`tenant-access-user:${userId}`)
        .on('broadcast', { event: 'tenant_user_access_changed' }, ({ payload }) => {
          const event = payload as { revoked?: unknown; activo?: unknown; tenant_id?: unknown };
          if (event.tenant_id === tenantId && (event.revoked === true || event.activo === false)) {
            this.callbacks.onRevoked(tenantId);
          }
        });
      this.channels.push(userChannel);
    }

    for (const channel of this.channels) {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') this.callbacks.onReconnect(tenantId);
      });
    }
    this.reconcileTimer = setInterval(() => this.callbacks.onReconnect(tenantId), this.reconcileMs);
  }

  stop(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    for (const channel of this.channels) void this.client.removeChannel(channel);
    this.channels = [];
    this.tenantId = null;
    this.userId = null;
  }
}
