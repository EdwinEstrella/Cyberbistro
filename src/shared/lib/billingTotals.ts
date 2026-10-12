export const LEGAL_PROPINA_RATE = 0.10;

export interface InvoiceTotalsInput {
  subtotal: number;
  itbisRate: number;
  propinaEnabled: boolean;
  /**
   * When true, `subtotal` is the gross menu amount and already contains ITBIS.
   * Propina is still computed on the gross menu amount.
   */
  itbisIncluded?: boolean;
}

export interface InvoiceTotals {
  subtotal: number;
  itbis: number;
  propina: number;
  total: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function calculateInvoiceTotals({
  subtotal,
  itbisRate,
  propinaEnabled,
  itbisIncluded = false,
}: InvoiceTotalsInput): InvoiceTotals {
  const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
  const safeItbisRate = Number.isFinite(itbisRate) ? itbisRate : 0;
  const propina = propinaEnabled ? safeSubtotal * LEGAL_PROPINA_RATE : 0;

  if (itbisIncluded && safeItbisRate > 0) {
    const base = round2(safeSubtotal / (1 + safeItbisRate));
    const itbis = round2(safeSubtotal - base);
    return {
      subtotal: base,
      itbis,
      propina,
      total: safeSubtotal + propina,
    };
  }

  const itbis = safeSubtotal * safeItbisRate;

  return {
    subtotal: safeSubtotal,
    itbis,
    propina,
    total: safeSubtotal + itbis + propina,
  };
}
