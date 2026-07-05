export const LEGAL_PROPINA_RATE = 0.10;

export interface InvoiceTotalsInput {
  subtotal: number;
  itbisRate: number;
  propinaEnabled: boolean;
}

export interface InvoiceTotals {
  subtotal: number;
  itbis: number;
  propina: number;
  total: number;
}

export function calculateInvoiceTotals({
  subtotal,
  itbisRate,
  propinaEnabled,
}: InvoiceTotalsInput): InvoiceTotals {
  const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
  const safeItbisRate = Number.isFinite(itbisRate) ? itbisRate : 0;
  const itbis = safeSubtotal * safeItbisRate;
  const propina = propinaEnabled ? safeSubtotal * LEGAL_PROPINA_RATE : 0;

  return {
    subtotal: safeSubtotal,
    itbis,
    propina,
    total: safeSubtotal + itbis + propina,
  };
}
