import { readLocalCuentasPagar, readLocalCxpPagos } from "../../billing/lib/accountsLocal";

export interface PurchasePayment {
  id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
}

const READ_LIMIT = 20000;

const DEFAULT_DELETE_MESSAGE =
  "Esta acción es irreversible. Se eliminará la factura, la cuenta por pagar y se restará automáticamente del inventario la cantidad de insumos que entraron con esta compra.";

const formatMoney = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatPaymentDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/**
 * Payments registered against the payable(s) of a purchase, oldest first.
 * Never throws: a read failure yields an empty list so deletion is not blocked.
 */
export async function findPurchasePayments(tenantId: string, compraId: string): Promise<PurchasePayment[]> {
  try {
    const [cuentas, pagos] = await Promise.all([
      readLocalCuentasPagar(tenantId, { limit: READ_LIMIT }),
      readLocalCxpPagos(tenantId, { limit: READ_LIMIT }),
    ]);
    const cuentaIds = new Set(
      cuentas.filter((c) => String(c.compra_id ?? "") === compraId).map((c) => String(c.id)),
    );
    if (cuentaIds.size === 0) return [];
    return pagos
      .filter((p) => cuentaIds.has(String(p.cuenta_pagar_id ?? "")))
      .map((p) => ({
        id: String(p.id),
        monto: Number(p.monto) || 0,
        fecha_pago: String(p.fecha_pago ?? ""),
        metodo_pago: String(p.metodo_pago ?? ""),
      }))
      .sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago));
  } catch {
    return [];
  }
}

export function buildDeletePurchaseMessage(payments: PurchasePayment[]): string {
  if (payments.length === 0) return DEFAULT_DELETE_MESSAGE;
  const total = payments.reduce((sum, p) => sum + p.monto, 0);
  const noun = payments.length === 1 ? "1 pago registrado" : `${payments.length} pagos registrados`;
  const lines = payments.map((p) => `• ${formatPaymentDate(p.fecha_pago)}: ${formatMoney(p.monto)}`);
  return [
    `Esta compra a crédito tiene ${noun} por un total de ${formatMoney(total)}.`,
    lines.join("\n"),
    "Si elimina esta compra, estos pagos también se eliminarán.",
    DEFAULT_DELETE_MESSAGE,
  ].join("\n\n");
}
