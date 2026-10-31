import { describe, it, expect, vi } from "vitest";
import { TenantRealtimeSubscriptionManager } from "./tenantRealtimeSubscriptionManager";

describe("TenantRealtimeSubscriptionManager", () => {
  function createMockClient() {
    let subscribeCb: ((status: string) => void) | null = null;
    const channelMock: any = {
      on: vi.fn().mockImplementation(() => channelMock),
      subscribe: vi.fn((cb: (status: string) => void) => {
        subscribeCb = cb;
        return channelMock;
      }),
      send: vi.fn(),
    };

    const clientMock = {
      channel: vi.fn(() => channelMock),
      removeChannel: vi.fn().mockResolvedValue(true),
    };

    return {
      client: clientMock as any,
      channelMock,
      triggerStatus: (status: string) => subscribeCb?.(status),
    };
  }

  it("notifies status listeners when channel status changes", () => {
    const { client, triggerStatus } = createMockClient();
    const manager = new TenantRealtimeSubscriptionManager(client);

    const statusUpdates: string[] = [];
    const reg = manager.acquire("test-topic", {}, (status) => {
      statusUpdates.push(status);
    });

    expect(statusUpdates).toEqual([]);
    expect(manager.getChannelStatus("test-topic")).toBeNull();

    triggerStatus("SUBSCRIBED");
    expect(statusUpdates).toEqual(["SUBSCRIBED"]);
    expect(manager.getChannelStatus("test-topic")).toBe("SUBSCRIBED");

    // Second consumer gets initial status immediately
    const secondUpdates: string[] = [];
    const reg2 = manager.acquire("test-topic", {}, (status) => {
      secondUpdates.push(status);
    });
    expect(secondUpdates).toEqual(["SUBSCRIBED"]);

    reg.release();
    reg2.release();
  });

  it("removes status listener on release", () => {
    const { client, triggerStatus } = createMockClient();
    const manager = new TenantRealtimeSubscriptionManager(client);

    const statusUpdates: string[] = [];
    const reg = manager.acquire("test-topic-2", {}, (status) => {
      statusUpdates.push(status);
    });

    reg.release();
    triggerStatus("SUBSCRIBED");
    expect(statusUpdates).toEqual([]);
  });
});
