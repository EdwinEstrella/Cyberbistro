import { isSaleInvoice } from "../../../shared/lib/invoiceKind";

export interface CycleSaleInvoice {
  estado?: string | null;
  credit_note_of?: string | null;
  metodo_pago?: string | null;
  subtotal: number;
  itbis: number;
  propina?: number | null;
  total: number;
}

export interface CycleCxcPayment {
  metodo_pago?: string | null;
  monto: number;
}

/**
 * Sales summary of a cash cycle. Credit notes (E34) reverse a sale and the refund is booked as an
 * expense, so they are excluded from every sales figure but kept in the returned list.
 */
export function summarizeCycleSales<T extends CycleSaleInvoice>(facturas: T[], cxcPagos: CycleCxcPayment[]) {
  const sales = facturas.filter(isSaleInvoice);
  const totalFacturas = sales.reduce((s, f) => s + Number(f.total), 0);
  const subtotal = sales.reduce((s, f) => s + Number(f.subtotal), 0);
  const itbis = sales.reduce((s, f) => s + Number(f.itbis), 0);
  const propina = sales.reduce((s, f) => s + Number(f.propina ?? 0), 0);
  const totalCxc = cxcPagos.reduce((s, p) => s + Number(p.monto), 0);

  const byMethod = new Map<string, { cantidad: number; total: number }>();
  for (const f of sales) {
    const k = f.metodo_pago || "otro";
    const cur = byMethod.get(k) ?? { cantidad: 0, total: 0 };
    cur.cantidad += 1;
    cur.total += Number(f.total);
    byMethod.set(k, cur);
  }
  for (const p of cxcPagos) {
    const k = p.metodo_pago || "otro";
    const cur = byMethod.get(k) ?? { cantidad: 0, total: 0 };
    cur.cantidad += 1;
    cur.total += Number(p.monto);
    byMethod.set(k, cur);
  }
  return {
    facturas,
    totalPagado: totalFacturas + totalCxc,
    subtotalPagado: subtotal,
    itbisPagado: itbis,
    propinaPagado: propina,
    porMetodo: [...byMethod.entries()].map(([metodo, v]) => ({ metodo, ...v })).sort((a, b) => b.total - a.total),
  };
}
