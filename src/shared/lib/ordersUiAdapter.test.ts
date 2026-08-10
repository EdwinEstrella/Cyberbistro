import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceKitchenOrder, saveCamareraOrder, saveTableState } from "./ordersUiAdapter";

describe("C2 renderer adapters", () => {
  it("routes Tables, Camarera, and Cocina commands only through the named local bridge", async () => {
    const execute = vi.fn(async () => ({ ok: true as const, data: { commitId: "c2-1", localStatus: "committed" as const, syncStatus: "pending" as const } }));
    vi.stubGlobal("window", { electronAPI: { executeOrdersCommand: execute } });

    await expect(saveTableState({ type: "orders.table.set-state", tableId: "table-1", tableNumber: 1, state: "occupied" })).resolves.toMatchObject({ localStatus: "committed" });
    await saveCamareraOrder({ type: "orders.order-to-kitchen", orderId: "order-1", tableId: "table-1", tableNumber: 1, items: [{ id: "item-1", productId: "product-1", name: "Burger", quantity: 1, unitPrice: 10 }] });
    await advanceKitchenOrder({ type: "orders.kitchen.advance", orderId: "order-1", nextState: "preparing" });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenLastCalledWith({ type: "orders.kitchen.advance", orderId: "order-1", nextState: "preparing" });
  });

  it("fails closed when the local C2 bridge is unavailable", async () => {
    vi.stubGlobal("window", { electronAPI: {} });
    await expect(saveTableState({ type: "orders.table.set-state", tableId: "table-1", tableNumber: 1, state: "free" })).rejects.toThrow("Orders local storage is unavailable");
  });
});

afterEach(() => vi.unstubAllGlobals());
