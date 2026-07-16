import { describe, expect, it, vi } from "vitest";
import { createRealtimeSubscriptionLifecycle } from "./realtimeLifecycle";

describe("realtime subscription lifecycle", () => {
  it("unsubscribes an established subscription during cleanup", () => {
    const unsubscribe = vi.fn();
    const lifecycle = createRealtimeSubscriptionLifecycle(unsubscribe);

    expect(lifecycle.markSubscribed()).toBe(true);
    lifecycle.dispose();
    lifecycle.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when subscribe resolves after cleanup", () => {
    const unsubscribe = vi.fn();
    const lifecycle = createRealtimeSubscriptionLifecycle(unsubscribe);

    lifecycle.dispose();

    expect(lifecycle.markSubscribed()).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("prevents subscribe after cancellation during connect", async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn();
    const lifecycle = createRealtimeSubscriptionLifecycle(unsubscribe);

    const connect = Promise.resolve().then(() => {
      lifecycle.dispose();
      if (lifecycle.isDisposed()) return;
      subscribe();
    });
    await connect;

    expect(subscribe).not.toHaveBeenCalled();
  });
});
