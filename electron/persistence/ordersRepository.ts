import { randomUUID } from "node:crypto";
import type { OrdersCommand, OrdersRepositoryResult } from "../../src/shared/lib/ordersContracts";

export interface OrdersRepositoryStore {
  executeOrdersCommand(input: { command: OrdersCommand; commitId: string; branchId: string }): void;
}

/** Main-process-only C2 gateway; it never accepts tenant, SQL, table, or endpoint input. */
export class OrdersRepository {
  constructor(private readonly input: { store: OrdersRepositoryStore; branchId: string; createCommitId?: () => string }) {}

  execute(command: OrdersCommand): OrdersRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeOrdersCommand({ command, commitId, branchId: this.input.branchId });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
