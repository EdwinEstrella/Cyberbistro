export const PAYROLL_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export const PAYROLL_ADJUSTMENT_KINDS = ["bonus", "discount"] as const;
export const PAYROLL_ADJUSTMENT_SCOPES = ["currentPayment", "nextPayment"] as const;

export type PayrollFrequency = (typeof PAYROLL_FREQUENCIES)[number];
export type PayrollAdjustmentKind = (typeof PAYROLL_ADJUSTMENT_KINDS)[number];
export type PayrollAdjustmentScope = (typeof PAYROLL_ADJUSTMENT_SCOPES)[number];

export interface PayrollEmployee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  baseSalaryCents: number;
  frequency: PayrollFrequency;
  isActive: boolean;
}

export interface PayrollEmployeeDraft {
  id?: string;
  firstName: string;
  lastName: string;
  role: string;
  baseSalaryCents: number;
  frequency: PayrollFrequency;
  isActive: boolean;
}

export interface PayrollPaymentAdjustment {
  kind: PayrollAdjustmentKind;
  type: string;
  scope: PayrollAdjustmentScope;
  amountCents: number;
  note: string;
}

export interface PayrollPaymentContextRequest {
  employeeId: string;
  period: string;
  frequency: PayrollFrequency;
  adjustments: PayrollPaymentAdjustment[];
}

export interface PayrollPaymentContext {
  employeeId: string;
  period: string;
  frequency: PayrollFrequency;
  baseSalaryCents: number;
  periodSalaryCents: number;
  adjustmentDeltaCents: number;
  dueCents: number;
  alreadyPaidCents: number;
  pendingCents: number;
}

export interface PayrollCreatePaymentRequest extends PayrollPaymentContextRequest {
  paymentAmountCents: number;
  receiptSnapshot: string;
}

export interface PayrollPaymentRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  period: string;
  frequency: PayrollFrequency;
  baseSalaryCents: number;
  periodSalaryCents: number;
  adjustmentsDeltaCents: number;
  totalDueCents: number;
  amountPaidCents: number;
  pendingCents: number;
  receiptSnapshot: string;
  createdAt: string;
}

export type PayrollCommand =
  | { type: "payroll.getEmployees"; tenantId: string; sucursalId: string }
  | { type: "payroll.getPayments"; tenantId: string; sucursalId: string; employeeId?: string }
  | { type: "payroll.upsertEmployee"; tenantId: string; sucursalId: string; employee: PayrollEmployeeDraft }
  | { type: "payroll.disableEmployee"; tenantId: string; sucursalId: string; employeeId: string }
  | { type: "payroll.getPaymentContext"; tenantId: string; sucursalId: string; payload: PayrollPaymentContextRequest }
  | { type: "payroll.createPayment"; tenantId: string; sucursalId: string; payload: PayrollCreatePaymentRequest };

export type PayrollRepositoryResult =
  | { type: "payroll.employees"; employees: PayrollEmployee[] }
  | { type: "payroll.payments"; payments: PayrollPaymentRecord[] }
  | { type: "payroll.paymentContext"; context: PayrollPaymentContext }
  | { type: "payroll.employeeSaved"; id: string }
  | { type: "payroll.paymentCommitted"; paymentId: string; expenseId: string; context: PayrollPaymentContext }
  | { type: "payroll.success" };

export interface PayrollAdapter {
  getEmployees(tenantId: string, sucursalId: string): Promise<PayrollEmployee[]>;
  getPayments(tenantId: string, sucursalId: string, employeeId?: string): Promise<PayrollPaymentRecord[]>;
  upsertEmployee(tenantId: string, sucursalId: string, employee: PayrollEmployeeDraft): Promise<string>;
  disableEmployee(tenantId: string, sucursalId: string, employeeId: string): Promise<void>;
  getPaymentContext(tenantId: string, sucursalId: string, payload: PayrollPaymentContextRequest): Promise<PayrollPaymentContext>;
  createPayment(tenantId: string, sucursalId: string, payload: PayrollCreatePaymentRequest): Promise<{ paymentId: string; expenseId: string; context: PayrollPaymentContext }>;
}
