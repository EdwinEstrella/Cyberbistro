import { isCreditNoteInvoice } from "../../../shared/lib/invoiceKind";
import { toDominicanLocalDate } from "../../../shared/lib/businessDate";
import { formatDgiiAmount, formatDgiiDate, formatDgiiField, normalizeDgiiRnc } from "./dgiiHelpers";

export const CONSUMO_DETAIL_THRESHOLD = 250000;
export const MAX_RECORDS = 65000;

export type TipoIdentificacionDgii = "1" | "2" | "3";

export interface VentaFiscal607 {
  rnc_cedula: string;
  tipo_identificacion: TipoIdentificacionDgii;
  ncf: string;
  ncf_modificado: string | null;
  tipo_ingreso: string;
  fecha_comprobante: string;
  fecha_retencion: string | null;
  monto_facturado: number;
  itbis_facturado: number;
  itbis_retenido: number;
  itbis_percibido: number;
  retencion_renta: number;
  isr_percibido: number;
  impuesto_selectivo: number;
  otros_impuestos: number;
  propina_legal: number;
  efectivo: number;
  cheque_transferencia_deposito: number;
  tarjeta: number;
  venta_credito: number;
  bonos_certificados: number;
  permuta: number;
  otras_formas: number;
}

export interface Formato607InvoiceInput {
  id?: string;
  numero_factura?: number | string | null;
  ncf?: string | null;
  ncf_tipo?: string | null;
  estado?: string | null;
  fiscal_mode?: string | null;
  subtotal?: number | null;
  itbis?: number | null;
  propina?: number | null;
  total?: number | null;
  metodo_pago?: string | null;
  created_at?: string | null;
  pagada_at?: string | null;
  cliente_rnc?: string | null;
  credit_note_of?: string | null;
  ref_ncf?: string | null;
}

export interface ConsumoSummaryResult {
  count: number;
  totalMontoFacturado: number;
}

export type PaymentCategory =
  | "efectivo"
  | "cheque_transferencia_deposito"
  | "tarjeta"
  | "venta_credito"
  | "bonos_certificados"
  | "permuta"
  | "otras_formas";

function isCreditPaymentMethod(method: string | null | undefined): boolean {
  const m = (method ?? "").toLowerCase().trim();
  return m === "fiado" || m === "credito" || m === "crédito";
}

function classifyPaymentMethod(method: string | null | undefined): PaymentCategory {
  const m = (method ?? "").toLowerCase().trim();
  if (m === "efectivo" || m === "cash") return "efectivo";
  if (m === "transferencia" || m === "cheque" || m === "deposito" || m === "transfer") {
    return "cheque_transferencia_deposito";
  }
  if (m === "tarjeta" || m === "tarjeta_credito" || m === "tarjeta_debito" || m === "card") {
    return "tarjeta";
  }
  if (isCreditPaymentMethod(m)) return "venta_credito";
  if (m.startsWith("bono") || m.startsWith("certificado")) return "bonos_certificados";
  if (m === "permuta") return "permuta";
  return "otras_formas";
}

function splitPayment(
  metodoPago: string | null | undefined,
  total: number
): Record<PaymentCategory, number> {
  const split: Record<PaymentCategory, number> = {
    efectivo: 0,
    cheque_transferencia_deposito: 0,
    tarjeta: 0,
    venta_credito: 0,
    bonos_certificados: 0,
    permuta: 0,
    otras_formas: 0,
  };
  const cat = classifyPaymentMethod(metodoPago);
  split[cat] = total;
  return split;
}

/**
 * Returns the invoice fiscal date string (ISO).
 * Fiscal date prefers pagada_at if present, otherwise falls back to created_at.
 */
export function getInvoiceFiscalDate(invoice: Formato607InvoiceInput): string | null {
  return invoice.pagada_at || invoice.created_at || null;
}

function matchesPeriod(localDate: string | null, period: string): boolean {
  if (!localDate) return false;
  return localDate.slice(0, 7).replace("-", "") === period;
}

function isConsumoNcf(ncf: string): boolean {
  const normalized = ncf.trim().toUpperCase();
  return normalized.startsWith("B02") || normalized.startsWith("E32");
}

interface ReportableInvoiceMeta {
  ncf: string;
  localDate: string;
}

function getReportableInvoiceMeta(
  invoice: Formato607InvoiceInput,
  period: string
): ReportableInvoiceMeta | null {
  if (!invoice.ncf || !invoice.ncf.trim()) return null;
  if (invoice.fiscal_mode === "internal_receipt") return null;
  if (invoice.estado === "cancelada") return null;
  if (invoice.estado === "pendiente" && !isCreditPaymentMethod(invoice.metodo_pago)) return null;

  const fiscalInstant = getInvoiceFiscalDate(invoice);
  if (!fiscalInstant) return null;
  const localDate = toDominicanLocalDate(fiscalInstant);
  if (!matchesPeriod(localDate, period)) return null;

  return {
    ncf: invoice.ncf.trim().toUpperCase(),
    localDate,
  };
}

function invoiceAmounts(invoice: Formato607InvoiceInput): {
  subtotal: number;
  itbis: number;
  propina: number;
  total: number;
} {
  const subtotal = Math.abs(Number(invoice.subtotal) || 0);
  const itbis = Math.abs(Number(invoice.itbis) || 0);
  const propina = Math.abs(Number(invoice.propina) || 0);
  const total = Math.abs(Number(invoice.total) || subtotal + itbis + propina);
  return { subtotal, itbis, propina, total };
}

function resolveBuyerId(
  invoice: Formato607InvoiceInput,
  parentInvoiceMap: Map<string, Formato607InvoiceInput>
): { rnc_cedula: string; tipo_identificacion: TipoIdentificacionDgii } {
  let raw = (invoice.cliente_rnc ?? "").trim();

  if (!raw && isCreditNoteInvoice(invoice) && invoice.credit_note_of) {
    const parent = parentInvoiceMap.get(invoice.credit_note_of);
    if (parent?.cliente_rnc) {
      raw = parent.cliente_rnc.trim();
    }
  }

  if (!raw) {
    throw new Error(
      `El comprobante ${invoice.ncf || "sin NCF"} requiere RNC o cédula del comprador para el Formato 607.`
    );
  }

  if (/[a-zA-Z]/.test(raw)) {
    return { rnc_cedula: raw.replace(/[|\s]/g, "").trim(), tipo_identificacion: "3" };
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) {
    return { rnc_cedula: digits, tipo_identificacion: "1" };
  }
  if (digits.length === 11) {
    return { rnc_cedula: digits, tipo_identificacion: "2" };
  }

  throw new Error(
    `El comprobante ${invoice.ncf || "sin NCF"} tiene un RNC o cédula con longitud inválida.`
  );
}

function toDetailRow(
  invoice: Formato607InvoiceInput,
  ncf: string,
  localDate: string,
  parentInvoiceMap: Map<string, Formato607InvoiceInput>
): VentaFiscal607 {
  const { subtotal, itbis, propina, total: invoiceTotal } = invoiceAmounts(invoice);
  const isCreditNote = isCreditNoteInvoice(invoice);
  const { rnc_cedula, tipo_identificacion } = resolveBuyerId(invoice, parentInvoiceMap);
  const payments = splitPayment(invoice.metodo_pago, invoiceTotal);
  const ncfModificado = isCreditNote && invoice.ref_ncf ? invoice.ref_ncf.trim() : null;

  return {
    rnc_cedula,
    tipo_identificacion,
    ncf,
    ncf_modificado: ncfModificado,
    tipo_ingreso: "1",
    fecha_comprobante: localDate,
    fecha_retencion: null,
    monto_facturado: subtotal,
    itbis_facturado: itbis,
    itbis_retenido: 0,
    itbis_percibido: 0,
    retencion_renta: 0,
    isr_percibido: 0,
    impuesto_selectivo: 0,
    otros_impuestos: 0,
    propina_legal: propina,
    efectivo: payments.efectivo,
    cheque_transferencia_deposito: payments.cheque_transferencia_deposito,
    tarjeta: payments.tarjeta,
    venta_credito: payments.venta_credito,
    bonos_certificados: payments.bonos_certificados,
    permuta: payments.permuta,
    otras_formas: payments.otras_formas,
  };
}

/**
 * Builds the 607 detail rows for the specified month period (AAAAMM).
 * Excludes cancelled, non-credit pending, internal receipts, and non-detail consumo (< 250k).
 */
export function buildFormato607Rows(
  invoices: Formato607InvoiceInput[],
  period: string,
  parentInvoices: Formato607InvoiceInput[] = []
): VentaFiscal607[] {
  const parentInvoiceMap = new Map<string, Formato607InvoiceInput>();
  for (const parent of parentInvoices) {
    if (parent.id) parentInvoiceMap.set(parent.id, parent);
  }
  for (const inv of invoices) {
    if (inv.id) parentInvoiceMap.set(inv.id, inv);
  }

  const rows: VentaFiscal607[] = [];

  for (const invoice of invoices) {
    const meta = getReportableInvoiceMeta(invoice, period);
    if (!meta) continue;

    const { ncf, localDate } = meta;
    const isCreditNote = isCreditNoteInvoice(invoice);
    const { total: invoiceTotal } = invoiceAmounts(invoice);

    if (!isCreditNote && isConsumoNcf(ncf)) {
      if (invoiceTotal < CONSUMO_DETAIL_THRESHOLD) {
        continue;
      }
    }

    rows.push(toDetailRow(invoice, ncf, localDate, parentInvoiceMap));
  }

  return rows;
}

/**
 * Computes the general summary of consumo invoices (B02 / E32) below RD$ 250,000 for the period.
 * These are entered manually by the accountant in the DGII Oficina Virtual.
 */
export function consumoSummary(
  invoices: Formato607InvoiceInput[],
  period: string
): ConsumoSummaryResult {
  let count = 0;
  let totalMontoFacturado = 0;

  for (const invoice of invoices) {
    const meta = getReportableInvoiceMeta(invoice, period);
    if (!meta) continue;

    const { ncf } = meta;
    if (!isConsumoNcf(ncf)) continue;

    const { subtotal, total: invoiceTotal } = invoiceAmounts(invoice);

    if (invoiceTotal < CONSUMO_DETAIL_THRESHOLD) {
      count += 1;
      totalMontoFacturado += subtotal;
    }
  }

  return {
    count,
    totalMontoFacturado: Math.round(totalMontoFacturado * 100) / 100,
  };
}

/**
 * Generates the Formato 607 output string in either DGII TXT format or Excel-friendly CSV.
 */
export function generateFormato607(
  rncEmisor: string,
  period: string,
  rows: VentaFiscal607[],
  format: "txt" | "csv" = "txt"
): string {
  const normalizedRnc = normalizeDgiiRnc(rncEmisor);
  if (normalizedRnc.length !== 9 && normalizedRnc.length !== 11) {
    throw new Error("El RNC o cédula del emisor no es válido.");
  }
  if (!/^\d{6}$/.test(period)) {
    throw new Error("El período debe usar el formato AAAAMM.");
  }
  if (rows.length > MAX_RECORDS) {
    throw new Error(`El archivo no puede exceder los ${MAX_RECORDS.toLocaleString("en-US")} registros.`);
  }

  const delimiter = format === "csv" ? "," : "|";

  const lines = rows.map((row) =>
    [
      formatDgiiField(row.rnc_cedula),
      formatDgiiField(row.tipo_identificacion),
      formatDgiiField(row.ncf),
      formatDgiiField(row.ncf_modificado),
      formatDgiiField(row.tipo_ingreso),
      formatDgiiDate(row.fecha_comprobante),
      formatDgiiDate(row.fecha_retencion),
      formatDgiiAmount(row.monto_facturado),
      formatDgiiAmount(row.itbis_facturado),
      formatDgiiAmount(row.itbis_retenido),
      formatDgiiAmount(row.itbis_percibido),
      formatDgiiAmount(row.retencion_renta),
      formatDgiiAmount(row.isr_percibido),
      formatDgiiAmount(row.impuesto_selectivo),
      formatDgiiAmount(row.otros_impuestos),
      formatDgiiAmount(row.propina_legal),
      formatDgiiAmount(row.efectivo),
      formatDgiiAmount(row.cheque_transferencia_deposito),
      formatDgiiAmount(row.tarjeta),
      formatDgiiAmount(row.venta_credito),
      formatDgiiAmount(row.bonos_certificados),
      formatDgiiAmount(row.permuta),
      formatDgiiAmount(row.otras_formas),
    ].join(delimiter)
  );

  if (format === "csv") {
    const headers = [
      "RNC/Cédula",
      "Tipo Id",
      "NCF",
      "NCF Modificado",
      "Tipo Ingreso",
      "Fecha Comprobante",
      "Fecha Retención",
      "Monto Facturado",
      "ITBIS Facturado",
      "ITBIS Retenido Terceros",
      "ITBIS Percibido",
      "Retención Renta Terceros",
      "ISR Percibido",
      "ISC",
      "Otros Impuestos",
      "Propina Legal",
      "Efectivo",
      "Cheque/Transferencia/Depósito",
      "Tarjeta Débito/Crédito",
      "Venta a Crédito",
      "Bonos/Certificados",
      "Permuta",
      "Otras Formas",
    ].join(",");

    return "\uFEFF" + [headers, ...lines].join("\r\n");
  }

  return [`607|${normalizedRnc}|${period}|${rows.length}`, ...lines].join("\r\n");
}
