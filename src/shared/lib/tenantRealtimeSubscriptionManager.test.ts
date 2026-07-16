import { describe, expect, it, vi } from "vitest";
import {
  TenantRealtimeSubscriptionManager,
  type TenantRealtimeClient,
} from "./tenantRealtimeSubscriptionManager";

function createClient() {
  const client: TenantRealtimeClient = {
    connect: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => ({ ok: true })),
    unsubscribe: vi.fn(async () => undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
  return client;
}

describe("tenant realtime subscription manager", () => {
  it("shares one channel across two consumers and tears it down after the final release", async () => {
    const client = createClient();
    const manager = new TenantRealtimeSubscriptionManager(client);
    const first = manager.acquire("cocina:tenant-1", { INSERT: vi.fn() });
    const second = manager.acquire("cocina:tenant-1", { UPDATE: vi.fn() });

    await Promise.all([first.ready, second.ready]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    expect(client.on).toHaveBeenCalledTimes(2);

    first.release();
    expect(client.unsubscribe).not.toHaveBeenCalled();
    second.release();
    second.release();
    await Promise.resolve();
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.off).toHaveBeenCalledTimes(2);
  });

  it("shares one channel across AppLayout, Pedidos, and Cocina-style consumers", async () => {
    const client = createClient();
    const manager = new TenantRealtimeSubscriptionManager(client);
    const appLayout = manager.acquire("cocina:tenant-1", { UPDATE_digital_order: vi.fn() });
    const pedidos = manager.acquire("cocina:tenant-1", { INSERT_digital_order: vi.fn() });
    const cocina = manager.acquire("cocina:tenant-1", { INSERT_comanda: vi.fn(), UPDATE_cocina_estado: vi.fn() });

    await Promise.all([appLayout.ready, pedidos.ready, cocina.ready]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    appLayout.release();
    pedidos.release();
    expect(client.unsubscribe).not.toHaveBeenCalled();
    cocina.release();
    await Promise.resolve();
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when the only consumer leaves during connect", async () => {
    const client = createClient();
    let resolveConnect!: () => void;
    client.connect = vi.fn(() => new Promise<void>((resolve) => { resolveConnect = resolve; }));
    const manager = new TenantRealtimeSubscriptionManager(client);
    const registration = manager.acquire("cocina:tenant-1", { INSERT: vi.fn() });

    registration.release();
    resolveConnect();
    await registration.ready;

    expect(client.subscribe).not.toHaveBeenCalled();
    expect(client.unsubscribe).not.toHaveBeenCalled();
  });

  it("does not let a stale pending subscribe unsubscribe its replacement generation", async () => {
    const client = createClient();
    const resolves: Array<(value: { ok: true }) => void> = [];
    client.subscribe = vi.fn(() => new Promise<{ ok: true }>((resolve) => resolves.push(resolve)));
    const manager = new TenantRealtimeSubscriptionManager(client);
    const first = manager.acquire("cocina:tenant-1", { INSERT: vi.fn() });
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(1));
    first.release();
    const replacement = manager.acquire("cocina:tenant-1", { UPDATE: vi.fn() });
    resolves[0]({ ok: true });
    await Promise.resolve();
    await vi.waitFor(() => expect(client.unsubscribe).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(client.subscribe).toHaveBeenCalledTimes(2));
    resolves[1]({ ok: true });
    await replacement.ready;
    replacement.release();
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("handles tenant A to B to A transitions without stale teardown", async () => {
    const client = createClient();
    const manager = new TenantRealtimeSubscriptionManager(client);
    const tenantA1 = manager.acquire("cocina:tenant-a", { INSERT: vi.fn() });
    await tenantA1.ready;
    tenantA1.release();
    const tenantB = manager.acquire("cocina:tenant-b", { INSERT: vi.fn() });
    const tenantA2 = manager.acquire("cocina:tenant-a", { UPDATE: vi.fn() });
    await Promise.all([tenantB.ready, tenantA2.ready]);
    expect(client.subscribe).toHaveBeenCalledTimes(3);
    tenantB.release();
    tenantA2.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.unsubscribe).toHaveBeenCalledTimes(3);
  });
});
