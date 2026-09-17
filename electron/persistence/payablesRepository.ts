import { randomUUID } from "node:crypto";

export type PayablesCommand =
  | {
      type: "payables.create";
      id: string;
      supplierId: string;
      compraId?: string;
      totalAmount: number;
      dueDate?: string;
      sucursalId?: string | null;
      fechaEmision?: string;
      observacion?: string | null;
    }
  | {
      type: "payables.payment.record";
      paymentId: string;
      payableId: string;
      amount: number;
      paymentMethod: string;
      sucursalId?: string | null;
      cycleId?: string | null;
      notas?: string | null;
      usuarioId?: string | null;
      fechaPago?: string;
      // When present, the settlement is also recorded as an operational expense in
      // the SAME transaction, so the cierre sees the cash-out atomically with the
      // payment (a payables payment is money leaving the drawer).
      expense?: {
        id: string;
        categoryId?: string | null;
        description: string;
        supplier?: string | null;
        notes?: string | null;
      };
    };

export type PayablesRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};

export interface PayablesRepositoryStore {
  executePayablesCommand(input: {
    command: PayablesCommand;
    commitId: string;
    branchId: string;
  }): void;
}

export class PayablesRepository {
  constructor(
    private readonly input: {
      store: PayablesRepositoryStore;
      branchId: string;
      createCommitId?: () => string;
    },
  ) {}

  execute(command: PayablesCommand): PayablesRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executePayablesCommand({
      command,
      commitId,
      branchId: this.input.branchId,
    });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
