import type {
  PayrollEmployee,
  PayrollPaymentAdjustment,
  PayrollPaymentContext,
  PayrollPaymentContextRequest,
} from "./payrollContracts";

export type PayrollPaymentHistory = {
  employeeId: string;
  period: string;
  baseSalaryCents: number;
  periodSalaryCents: number;
  adjustmentsDeltaCents: number;
  amountPaidCents: number;
  createdAt: string;
};

const FREQUENCY_DIVISOR = {
  weekly: 4,
  biweekly: 2,
  monthly: 1,
} as const;

export function calculatePayrollPaymentContext(
  employee: PayrollEmployee,
  request: PayrollPaymentContextRequest,
  paymentHistory: PayrollPaymentHistory[],
): PayrollPaymentContext {
  if (employee.id !== request.employeeId) throw new Error("Employee mismatch");
  if (employee.frequency !== request.frequency) throw new Error("Employee frequency mismatch");

  const priorPayments = paymentHistory.filter(
    (payment) => payment.employeeId === request.employeeId && payment.period === request.period,
  );
  const firstPayment = priorPayments[0];
  const baseSalaryCents = firstPayment?.baseSalaryCents ?? employee.baseSalaryCents;
  const periodSalaryCents = firstPayment?.periodSalaryCents
    ?? Math.round(employee.baseSalaryCents / FREQUENCY_DIVISOR[employee.frequency]);
  const priorAdjustmentDeltaCents = priorPayments.reduce(
    (total, payment) => total + payment.adjustmentsDeltaCents,
    0,
  );
  const { deltaCents: currentAdjustmentDeltaCents } = getCurrentPaymentAdjustmentTotals(request.adjustments);
  const alreadyPaidCents = priorPayments.reduce((total, payment) => total + payment.amountPaidCents, 0);
  const adjustmentDeltaCents = priorAdjustmentDeltaCents + currentAdjustmentDeltaCents;
  const dueCents = Math.max(periodSalaryCents + adjustmentDeltaCents, 0);

  return {
    employeeId: request.employeeId,
    period: request.period,
    frequency: request.frequency,
    baseSalaryCents,
    periodSalaryCents,
    adjustmentDeltaCents,
    dueCents,
    alreadyPaidCents,
    pendingCents: Math.max(dueCents - alreadyPaidCents, 0),
  };
}

export function getCurrentPaymentAdjustmentTotals(adjustments: PayrollPaymentAdjustment[]): {
  bonusesCents: number;
  discountsCents: number;
  deltaCents: number;
} {
  const totals = adjustments.reduce(
    (current, adjustment) => {
      if (adjustment.scope !== "currentPayment") return current;
      if (adjustment.kind === "bonus") current.bonusesCents += adjustment.amountCents;
      else current.discountsCents += adjustment.amountCents;
      return current;
    },
    { bonusesCents: 0, discountsCents: 0 },
  );
  return { ...totals, deltaCents: totals.bonusesCents - totals.discountsCents };
}
