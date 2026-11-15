import type { DigitalOrder } from "./pedidosTypes";

type QueueOrder = Pick<DigitalOrder, "status" | "order_type" | "created_at">;

function createdAtMs(order: QueueOrder): number {
  const time = Date.parse(order.created_at);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Orders the Pedidos list as a work queue:
 * 1. Pending orders first (they need an answer), then everything already handled.
 * 2. Among pending orders, company orders come before public ones (companies have priority),
 *    and the oldest waiting order goes first inside each group.
 * 3. Handled orders keep the newest-first history order.
 * Pure and stable: it never mutates its input.
 */
export function sortOrdersForQueue<T extends QueueOrder>(orders: readonly T[]): T[] {
  return orders
    .map((order, index) => ({ order, index }))
    .sort((a, b) => {
      const aPending = a.order.status === "pending";
      const bPending = b.order.status === "pending";
      if (aPending !== bPending) return aPending ? -1 : 1;

      if (aPending) {
        const aCompany = a.order.order_type === "company";
        const bCompany = b.order.order_type === "company";
        if (aCompany !== bCompany) return aCompany ? -1 : 1;
        const byAge = createdAtMs(a.order) - createdAtMs(b.order);
        return byAge !== 0 ? byAge : a.index - b.index;
      }

      const byRecent = createdAtMs(b.order) - createdAtMs(a.order);
      return byRecent !== 0 ? byRecent : a.index - b.index;
    })
    .map(({ order }) => order);
}
