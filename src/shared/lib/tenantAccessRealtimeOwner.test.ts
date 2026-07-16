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
    const onReconnect = vi.fn();
    const owner = new TenantAccessRealtimeOwner(client, { onState, onReconnect }, 60_000);

    owner.start("tenant-a");
    await Promise.resolve();
    await Promise.resolve();
    emit("tenant_access_changed", { tenant_id: "tenant-a", activa: false });
    emit("tenant_access_changed", { tenant_id: "tenant-a", activa: true });

    expect(onState).toHaveBeenNthCalledWith(1, "tenant-a", false);
    expect(onState).toHaveBeenNthCalledWith(2, "tenant-a", true);
    owner.stop();
  });

  it("reconciles after a reconnect", async () => {
    const { client, emit } = createClient();
    const onReconnect = vi.fn();
    const owner = new TenantAccessRealtimeOwner(client, { onState: vi.fn(), onReconnect }, 60_000);
    owner.start("tenant-a");
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(1));
    emit("connect", undefined);
    await vi.waitFor(() => expect(onReconnect).toHaveBeenCalledWith("tenant-a"));
    expect(onReconnect).toHaveBeenCalledWith("tenant-a");
    owner.stop();
  });
});
