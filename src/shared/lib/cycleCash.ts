export interface ExpectedCashDrawerInput {
  efectivoInicial: number;
  efectivoVentas: number;
  efectivoCxc?: number;
  efectivoGastos?: number;
}

export interface ExpenseCashInput {
  monto?: number;
  amount?: number;
  amount_cents?: number;
  metodo_pago?: string | null;
  payment_method?: string | null;
}

export function isCashPaymentMethod(metodoPago: string | null | undefined): boolean {
  const normalized = String(metodoPago ?? "").trim().toLowerCase();
  return normalized === "efectivo" || normalized === "cash";
}

export function getExpenseAmount(expense: ExpenseCashInput): number {
  if (typeof expense.monto === "number" && !Number.isNaN(expense.monto)) return expense.monto;
  if (typeof expense.amount === "number" && !Number.isNaN(expense.amount)) return expense.amount;
  if (typeof expense.amount_cents === "number" && !Number.isNaN(expense.amount_cents)) return expense.amount_cents / 100;
  return 0;
}

export function sumCashExpenses(expenses: ExpenseCashInput[]): number {
  return expenses.reduce((total, expense) => {
    const isCash = isCashPaymentMethod(expense.metodo_pago ?? expense.payment_method);
    return isCash ? total + getExpenseAmount(expense) : total;
  }, 0);
}

export function calculateExpectedCashDrawer({
  efectivoInicial,
  efectivoVentas,
  efectivoCxc = 0,
  efectivoGastos = 0,
}: ExpectedCashDrawerInput): number {
  return efectivoInicial + efectivoVentas + efectivoCxc - efectivoGastos;
}
