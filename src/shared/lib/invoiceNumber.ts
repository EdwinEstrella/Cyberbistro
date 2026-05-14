import { insforgeClient } from "./insforge";
import { readLocalMirror } from "./localFirst";

function toValidInvoiceNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const normalized = Math.floor(n);
  return normalized > 0 ? normalized : null;
}

async function getMaxLocalInvoiceNumber(tenantId: string): Promise<number> {
  try {
    const invoices = await readLocalMirror<{ numero_factura?: unknown }>(tenantId, "facturas");
    return invoices.reduce((max, invoice) => {
      const n = toValidInvoiceNumber(invoice.numero_factura);
      return n == null ? max : Math.max(max, n);
    }, 0);
  } catch {
    return 0;
  }
}

async function getMaxServerInvoiceNumber(tenantId: string): Promise<number> {
  try {
    const { data, error } = await insforgeClient.database
      .from("facturas")
      .select("numero_factura")
      .eq("tenant_id", tenantId)
      .order("numero_factura", { ascending: false })
      .limit(1);

    if (error || !data?.[0]) return 0;
    return toValidInvoiceNumber((data[0] as { numero_factura?: unknown }).numero_factura) ?? 0;
  } catch {
    return 0;
  }
}

export async function getNextFacturaNumber(tenantId: string): Promise<number> {
  const localMax = await getMaxLocalInvoiceNumber(tenantId);
  const serverMax = typeof navigator !== "undefined" && navigator.onLine
    ? await getMaxServerInvoiceNumber(tenantId)
    : 0;

  return Math.max(localMax, serverMax) + 1;
}
