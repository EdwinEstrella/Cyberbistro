import { supabase } from "../../../../shared/lib/supabase";
import { printLocalInvoiceReceipt } from "../../../../shared/lib/localInvoiceReceipt";
import type { PrintThermalResult } from "../../../../shared/lib/thermalPrint";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveRpcBranchId(sucursalId: string | null | undefined): string | null {
  return sucursalId && UUID_RE.test(sucursalId) ? sucursalId : null;
}

export interface ConsolidatedPreviewRow {
  cxc_id: string;
  date: string;
  numero_pedido: number;
  employee_name: string;
  amount: number;
}

export interface ConsolidatedInvoiceCustomer {
  name: string;
  document_id: string | null;
  rnc_valid: boolean;
}

export interface ConsolidatedInvoicePreview {
  customer: ConsolidatedInvoiceCustomer;
  rows: ConsolidatedPreviewRow[];
  subtotal: number | null;
  itbis: number | null;
  total: number;
  count: number;
  blocked_reason: string | null;
}

export interface IssueConsolidatedInvoiceResult {
  factura_id: string;
  ncf: string;
  total: number;
  count: number;
}

const ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["ITBIS_NOT_INCLUDED_UNSUPPORTED", "La factura consolidada requiere que los precios incluyan ITBIS (Ajustes → Facturación → ITBIS incluido en precio). Así el total de la factura coincide con lo que debe la empresa."],
  ["TOTAL_MISMATCH", "No se pudo emitir: el total no coincide con la deuda. Contactá a soporte."],
  ["PLAN_REQUIRED", "La facturación consolidada (e-CF) está disponible únicamente en el plan Corporativo."],
  ["BUYER_RNC_INVALID", "El RNC/Cédula del cliente no es válido. Debe tener 9 u 11 dígitos numéricos y un nombre registrado."],
  ["NOTHING_TO_INVOICE", "No hay pedidos pendientes de facturar para este cliente en el rango de fechas seleccionado."],
  ["ORDER_ALREADY_INVOICED", "Este pedido ya fue facturado; para corregirlo emití una nota de crédito."],
  ["CUSTOMER_NOT_FOUND", "El cliente no fue encontrado."],
  ["UNAUTHORIZED", "No tenés permisos para emitir facturas consolidadas."],
  ["insufficient_privilege", "No tenés permisos para realizar esta operación."],
  ["ECF_RANGE_NOT_CONFIGURED", "No hay un rango de secuencias E31 configurado. Contactá a soporte."],
  ["ECF_RANGE_EXHAUSTED", "Se agotó el rango de secuencias E31 autorizado por la DGII."],
  ["NCF fiscal no esta activo", "El NCF fiscal no está activo para este negocio."],
];

function extractErrorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const err = error as Record<string, unknown>;
    return [err.message, err.details, err.hint].filter((p) => typeof p === "string").join(" ");
  }
  return String(error);
}

export function mapConsolidatedInvoiceError(error: unknown): string {
  const text = extractErrorText(error);
  for (const [needle, msg] of ERROR_MESSAGES) {
    if (text.includes(needle)) return msg;
  }
  if (/failed to fetch|networkerror|network request failed|offline|timeout|abort/i.test(text)) {
    return "Sin conexión con la nube. Revisá tu conexión e intentá de nuevo.";
  }
  return text || "No se pudo emitir la factura consolidada. Intentá de nuevo.";
}

export function formatRdCurrency(amount: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function buildConsolidatedInvoiceConfirmMessage(empresa: string, total: number | string): string {
  const formattedTotal = typeof total === "number" ? formatRdCurrency(total) : total;
  return `Se emitirá un e-CF de crédito fiscal (E31) a ${empresa} por ${formattedTotal}. Esta acción no se puede deshacer; correcciones con nota de crédito.`;
}

export async function previewConsolidatedInvoice(
  customerId: string,
  from: string,
  to: string,
  sucursalId?: string | null
): Promise<ConsolidatedInvoicePreview> {
  const { data, error } = await supabase.rpc("cloudix_preview_consolidated_invoice", {
    p_customer_id: customerId,
    p_from: from,
    p_to: to,
    p_sucursal_id: resolveRpcBranchId(sucursalId),
  });

  if (error) throw new Error(mapConsolidatedInvoiceError(error));
  if (!data || typeof data !== "object") throw new Error("Respuesta inválida del servidor al previsualizar la factura.");
  return data as ConsolidatedInvoicePreview;
}

export async function issueConsolidatedInvoice(
  customerId: string,
  from: string,
  to: string,
  sucursalId?: string | null
): Promise<IssueConsolidatedInvoiceResult> {
  const { data, error } = await supabase.rpc("cloudix_issue_consolidated_invoice", {
    p_customer_id: customerId,
    p_from: from,
    p_to: to,
    p_sucursal_id: resolveRpcBranchId(sucursalId),
  });

  if (error) throw new Error(mapConsolidatedInvoiceError(error));
  if (!data || typeof data !== "object") throw new Error("Respuesta inválida del servidor al emitir la factura.");
  return data as IssueConsolidatedInvoiceResult;
}

export async function printConsolidatedInvoiceReceipt(
  tenantId: string,
  facturaId: string
): Promise<PrintThermalResult> {
  try {
    const { data: factura, error } = await supabase
      .from("facturas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", facturaId)
      .maybeSingle();

    if (error || !factura) {
      return { ok: false, error: "No se encontró la factura emitida para imprimir." };
    }

    const { data: ecfDocument } = await supabase
      .from("ecf_documents")
      .select("status, dgii_track_id, dgii_security_code, submitted_at")
      .eq("tenant_id", tenantId)
      .eq("factura_id", facturaId)
      .maybeSingle();

    return printLocalInvoiceReceipt({
      tenantId,
      factura: factura as Record<string, unknown>,
      numeroFactura: Number(factura.numero_factura ?? 0),
      ecfDocument: (ecfDocument as Record<string, unknown>) ?? null,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error imprimiendo el comprobante de la factura.",
    };
  }
}
