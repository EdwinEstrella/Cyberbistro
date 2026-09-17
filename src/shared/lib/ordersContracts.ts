export type OrderItem = { id: string; productId: string; name: string; quantity: number; unitPrice: number };

export type OrdersCommand =
  | { type: "orders.table.set-state"; tableId: string; tableNumber: number; state: "free" | "occupied" }
  | { type: "orders.kitchen.set-open"; id: string; isOpen: boolean }
  | { type: "orders.order-to-kitchen"; orderId: string; tableId: string; tableNumber: number; items: OrderItem[] }
  | { type: "orders.kitchen.advance"; orderId: string; nextState: "preparing" | "ready" | "delivered" }
  | { type: "orders.cycle.open"; id: string; businessDay: string; openingCash: number; cycleNumber: number; openedAt: string }
  | { type: "orders.cycle.close"; id: string; closedAt: string }
  | { type: "orders.cycle.mark-printed"; id: string; printedAt: string }
  | { type: "orders.cycle.discard"; id: string };

export type OrdersRepositoryResult = { commitId: string; localStatus: "committed"; syncStatus: "pending" };
