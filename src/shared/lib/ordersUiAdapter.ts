import type { OrdersCommand, OrdersRepositoryResult } from "./ordersContracts";

async function executeOrdersCommand(command: OrdersCommand): Promise<OrdersRepositoryResult> {
  const execute = typeof window !== "undefined" ? window.electronAPI?.executeOrdersCommand : undefined;
  if (!execute) throw new Error("Orders local storage is unavailable");
  return (await execute(command)).data;
}

/** Minimal Tables adapter: a renderer can request only a typed table state command. */
export const saveTableState = executeOrdersCommand;
/** Minimal Camarera adapter: order and kitchen rows are committed together in the main process. */
export const saveCamareraOrder = executeOrdersCommand;
/** Minimal Cocina adapter: kitchen transitions remain validated and transactional in the main process. */
export const advanceKitchenOrder = executeOrdersCommand;
/** Minimal Cierre adapter: operating cycle open in SQLite main process. */
export const openOperatingCycle = (id: string, businessDay: string, openingCash: number) =>
  executeOrdersCommand({ type: "orders.cycle.open", id, businessDay, openingCash });
/** Minimal Cierre adapter: operating cycle close in SQLite main process. */
export const closeOperatingCycle = (id: string) =>
  executeOrdersCommand({ type: "orders.cycle.close", id });
