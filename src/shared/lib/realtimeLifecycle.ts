export interface RealtimeSubscriptionLifecycle {
  isDisposed: () => boolean;
  markSubscribed: () => boolean;
  dispose: () => void;
}

/** Makes async realtime setup safe when cleanup wins the subscribe race. */
export function createRealtimeSubscriptionLifecycle(
  unsubscribe: () => void | Promise<void>,
): RealtimeSubscriptionLifecycle {
  let disposed = false;
  let subscribed = false;
  let unsubscribed = false;

  const disposeSubscription = () => {
    if (unsubscribed) return;
    unsubscribed = true;
    void unsubscribe();
  };

  return {
    isDisposed: () => disposed,
    markSubscribed: () => {
      subscribed = true;
      if (disposed) {
        disposeSubscription();
        return false;
      }
      return true;
    },
    dispose: () => {
      disposed = true;
      if (subscribed) disposeSubscription();
    },
  };
}
