import { describe, expect, it, vi } from "vitest";
import { TenantAccessRealtimeOwner, type TenantAccessRealtimeClient } from "./tenantAccessRealtimeOwner";

function createClient() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const client: TenantAccessRealtimeClient = {
    connect: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => ({ ok: true })),
    unsubscribe: vi.fn(),
    on: vi.fn((event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    }),
    off: vi.fn((event, handler) => handlers.get(event)?.delete(handler)),
  };
  return { client, emit: (event: string, payload: unknown) => handlers.get(event)?.forEach((handler) => handler(payload)) };
}

describe("TenantAccessRealtimeOwner", () => {
  it("propagates block and unblock without focus or reload", async () => {
    const { client, emit } = createClient();
    const onState = vi.fn();
    const onRevoked = vi.fn();
    const onReconnect = vi.fn();
    const owner = new TenantAccessRealtimeOwner(client, { onState, onRevoked, onReconnect }, 60_000);

    owner.start("tenant-a", "user-a");
    await Promise.resolve();
    await Promise.resolve();
    emit("tenant_access_changed", { tenant_id: "tenant-a", activa: false });
    emit("tenant_access_changed", { tenant_id: "tenant-a", activa: true });
    emit("tenant_user_access_changed", { tenant_id: "tenant-a", user_id: "user-a", revoked: true });

    expect(onState).toHaveBeenNthCalledWith(1, "tenant-a", false);
    expect(onState).toHaveBeenNthCalledWith(2, "tenant-a", true);
    expect(onRevoked).toHaveBeenCalledWith("tenant-a");
    owner.stop();
  });

  it("reconciles after a reconnect", async () => {
    const { client, emit } = createClient();
    const onReconnect = vi.fn();
    const owner = new TenantAccessRealtimeOwner(client, { onState: vi.fn(), onRevoked: vi.fn(), onReconnect }, 60_000);
    owner.start("tenant-a", "user-a");
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(2));
    emit("connect", undefined);
    await vi.waitFor(() => expect(onReconnect).toHaveBeenCalledWith("tenant-a"));
    expect(onReconnect).toHaveBeenCalledWith("tenant-a");
    owner.stop();
  });

  it("cleans a stale delayed subscribe before allowing replacement", async () => {
    const { client } = createClient();
    const subscriptions: Array<(value: { ok: true }) => void> = [];
    client.subscribe = vi.fn(() => new Promise<{ ok: true }>((resolve) => subscriptions.push(resolve)));
    const owner = new TenantAccessRealtimeOwner(client, { onState: vi.fn(), onRevoked: vi.fn(), onReconnect: vi.fn() });
    owner.start("tenant-a", "user-a");
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(1));
    owner.stop();
    owner.start("tenant-b", "user-b");
    subscriptions[0]({ ok: true });
    await vi.waitFor(() => expect(client.unsubscribe).toHaveBeenCalledWith("tenant-access:tenant-a"));
    subscriptions[1]({ ok: true });
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(3));
    subscriptions[2]({ ok: true });
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(4));
    subscriptions[3]({ ok: true });
    owner.stop();
  });
});
