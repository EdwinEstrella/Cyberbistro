export interface ExpectedCashDrawerInput {
  efectivoInicial: number;
  efectivoVentas: number;
  efectivoCxc?: number;
  efectivoGastos?: number;
}

export interface ExpenseCashInput {
  monto: number;
  metodo_pago?: string | null;
}

export function isCashPaymentMethod(metodoPago: string | null | undefined): boolean {
  return String(metodoPago ?? "").trim().toLowerCase() === "efectivo";
}

export function sumCashExpenses(expenses: ExpenseCashInput[]): number {
  return expenses.reduce((total, expense) => {
    return isCashPaymentMethod(expense.metodo_pago) ? total + Number(expense.monto) : total;
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
