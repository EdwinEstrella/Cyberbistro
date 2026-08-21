export interface PayrollEmployee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  baseSalary: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  isActive: boolean;
}

export interface PayrollPaymentAdjustment {
  kind: string;
  type: string;
  amount: number;
  note: string;
  applyMode: string;
}

export interface PayrollPaymentRequest {
  employeeId: string;
  period: string;
  frequency: string;
  baseAmount: number;
  amountPaid: number;
  pendingAmount: number;
  receiptSnapshot: string;
  adjustments: PayrollPaymentAdjustment[];
}

export interface PayrollAdapter {
  getEmployees(tenantId: string, sucursalId: string): Promise<PayrollEmployee[]>;
  upsertEmployee(tenantId: string, sucursalId: string, employee: Partial<PayrollEmployee> & { id?: string }): Promise<string>;
  disableEmployee(tenantId: string, sucursalId: string, employeeId: string): Promise<void>;
  createPayment(tenantId: string, sucursalId: string, payload: PayrollPaymentRequest): Promise<string>;
}
