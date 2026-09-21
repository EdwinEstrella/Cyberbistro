import { randomUUID } from "node:crypto";

export type CashPurchaseCommand = {
  type: "purchase.cash.create";
  purchaseId: string;
  supplierId: string;
  detailId: string;
  inventoryMovementId: string;
  expenseId: string;
  inventoryProductId: string;
  quantity: number;
  unitCost: number;
};

export type PurchaseItemInput = {
  id: string;
  productoId: string;
  cantidad: number;
  costoUnitario: number;
  total: number;
  movimientoId?: string;
  stockAntes?: number;
  stockDespues?: number;
};

export type PurchaseFiscalInput = {
  id: string;
  rncCedula: string;
  tipoIdentificacion?: string;
  tipoBienServicio?: string;
  ncf: string;
  ncfModificado?: string | null;
  fechaComprobante: string;
  fechaPago?: string | null;
  montoServicios?: number;
  montoBienes?: number;
  totalFacturado?: number;
  itbisFacturado?: number;
  itbisRetenido?: number;
  formaPago?: string;
  retencionIsr?: number;
  impuestoSelectivo?: number;
  otrosImpuestos?: number;
  propinaLegal?: number;
};

export type PurchaseExpenseInput = {
  id: string;
  categoryId?: string | null;
  amount: number;
  paymentMethod: string;
  description: string;
  notes?: string | null;
  expenseDate?: string;
  cycleId?: string | null;
};

export type PurchasePayableInput = {
  id: string;
  totalAmount: number;
  dueDate?: string;
  fechaEmision?: string;
  observacion?: string | null;
};

export type FullPurchaseCreateCommand = {
  type: "purchase.create";
  id: string;
  supplierId: string;
  providerName?: string;
  numeroFactura?: string | null;
  tipoPago: "contado" | "credito" | "parcial" | string;
  metodoPago?: string | null;
  montoPagado?: number;
  fechaCompra: string;
  total: number;
  cycleId?: string | null;
  estado?: string;
  observacion?: string | null;
  usuarioId?: string | null;
  sucursalId?: string | null;
  items: PurchaseItemInput[];
  fiscal?: PurchaseFiscalInput | null;
  expense?: PurchaseExpenseInput | null;
  payable?: PurchasePayableInput | null;
};

export type PurchaseDeleteCommand = {
  type: "purchase.delete";
  purchaseId: string;
  usuarioId?: string | null;
};

/**
 * Edits the fiscal/supplier header of an existing purchase (SQLite-only path).
 * Updates the purchase, its fiscal (606) row, its payable, and its linked
 * expense in one transaction, replacing the legacy IndexedDB-mirror writes.
 */
export type PurchaseUpdateFiscalCommand = {
  type: "purchase.updateFiscal";
  purchaseId: string;
  proveedorId: string;
  providerName?: string;
  providerRnc?: string;
  numeroFactura: string;
  fechaCompra: string;
  observacion?: string | null;
};

export type PurchaseCommand =
  | CashPurchaseCommand
  | FullPurchaseCreateCommand
  | PurchaseDeleteCommand
  | PurchaseUpdateFiscalCommand;

export type PurchaseRepositoryResult = { commitId: string; localStatus: "committed"; syncStatus: "pending" };
export type CashPurchaseRepositoryResult = PurchaseRepositoryResult;

export interface CashPurchaseRepositoryStore {
  executeCashPurchaseCommand(input: { command: PurchaseCommand; commitId: string; branchId: string }): void;
}

export class CashPurchaseRepository {
  constructor(private readonly input: { store: CashPurchaseRepositoryStore; branchId: string; createCommitId?: () => string }) {}
  execute(command: PurchaseCommand): PurchaseRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeCashPurchaseCommand({ command, commitId, branchId: this.input.branchId });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
