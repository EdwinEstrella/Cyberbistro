import { isCreditNoteInvoice } from "../../../shared/lib/invoiceKind";
import { normalizeTenantRol } from "../../../shared/lib/roleNav";

/** DGII IndicadorNotaCredito 0: the note must be issued within 30 days of the original. */
export const CREDIT_NOTE_WINDOW_DAYS = 30;
const TIME_ZONE = "America/Santo_Domingo";
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export interface CreditNoteInvoice {
  id: string;
  ncf?: string | null;
  estado?: string | null;
  credit_note_of?: string | null;
  metodo_pago?: string | null;
  created_at?: string | null;
  total?: number | string | null;
  cliente_nombre?: string | null;
  ref_ncf?: string | null;
  ref_razon_modificacion?: string | null;
  fiscal_status?: string | null;
}

export type IneligibleReason =
  | "is_credit_note"
  | "type"
  | "not_accepted"
  | "already_credited"
  | "credit_sale"
  | "window_expired";

export const INELIGIBLE_REASON_LABELS: Record<IneligibleReason, string> = {
  is_credit_note: "Ya es una nota de crédito",
  type: "Solo se acreditan facturas E31 y E32",
  not_accepted: "La DGII aún no aceptó esta factura",
  already_credited: "Ya tiene una nota de crédito",
  credit_sale: "Las ventas a crédito (fiado) no están soportadas aún",
  window_expired: `Pasaron más de ${CREDIT_NOTE_WINDOW_DAYS} días desde la emisión`,
};

/** Calendar day (YYYY-MM-DD) of an instant in Santo Domingo. */
export function santoDomingoDay(iso: string | Date): string {
  return DAY_FORMAT.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Whole Santo Domingo calendar days from `fromIso` to `now` (same rule as the cloud RPC). */
export function santoDomingoDaysBetween(fromIso: string, now: Date): number {
  const from = Date.parse(`${santoDomingoDay(fromIso)}T00:00:00Z`);
  const to = Date.parse(`${santoDomingoDay(now)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function isEligibleEcfType(ncf: string | null | undefined): boolean {
  const prefix = String(ncf ?? "").trim().slice(0, 3).toUpperCase();
  return prefix === "E31" || prefix === "E32";
}

export interface EligibilityContext {
  /** ecf_documents.status of the invoice (or the synced facturas.fiscal_status). */
  ecfStatus: string | null | undefined;
  creditedInvoiceIds: ReadonlySet<string>;
  now: Date;
}

/** First rule an invoice breaks, or null when a credit note can be issued for it. */
export function getIneligibleReason(invoice: CreditNoteInvoice, ctx: EligibilityContext): IneligibleReason | null {
  if (isCreditNoteInvoice(invoice)) return "is_credit_note";
  if (!isEligibleEcfType(invoice.ncf)) return "type";
  if (ctx.ecfStatus !== "accepted") return "not_accepted";
  if (ctx.creditedInvoiceIds.has(invoice.id)) return "already_credited";
  if (String(invoice.metodo_pago ?? "").trim().toLowerCase() === "fiado") return "credit_sale";
  if (!invoice.created_at || santoDomingoDaysBetween(invoice.created_at, ctx.now) > CREDIT_NOTE_WINDOW_DAYS) {
    return "window_expired";
  }
  return null;
}

export interface CreditNoteRow {
  invoice: CreditNoteInvoice;
  ecfStatus: string | null;
  reason: IneligibleReason | null;
}

/**
 * Splits the e-CF candidates (E31/E32, not credit notes) into eligible and
 * ineligible rows. Credit notes are used only to detect credited originals.
 */
export function buildCreditNoteRows(
  invoices: readonly CreditNoteInvoice[],
  ecfByInvoiceId: ReadonlyMap<string, { status?: string | null }>,
  now: Date,
): { eligible: CreditNoteRow[]; ineligible: CreditNoteRow[] } {
  const creditedInvoiceIds = new Set<string>();
  for (const inv of invoices) {
    if (isCreditNoteInvoice(inv) && inv.credit_note_of) creditedInvoiceIds.add(inv.credit_note_of);
  }
  const eligible: CreditNoteRow[] = [];
  const ineligible: CreditNoteRow[] = [];
  for (const invoice of invoices) {
    if (isCreditNoteInvoice(invoice) || !isEligibleEcfType(invoice.ncf)) continue;
    const ecfStatus = ecfByInvoiceId.get(invoice.id)?.status ?? invoice.fiscal_status ?? null;
    const reason = getIneligibleReason(invoice, { ecfStatus, creditedInvoiceIds, now });
    (reason ? ineligible : eligible).push({ invoice, ecfStatus, reason });
  }
  return { eligible, ineligible };
}

function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Search by NCF or customer name. */
export function filterCreditNoteRows<T extends { invoice: CreditNoteInvoice }>(rows: readonly T[], query: string): T[] {
  const needle = fold(query).trim();
  if (!needle) return [...rows];
  return rows.filter(({ invoice }) => fold(invoice.ncf).includes(needle) || fold(invoice.cliente_nombre).includes(needle));
}

/** Issuing and viewing credit notes is an admin-only capability. */
export function canManageCreditNotes(rol: string | null): boolean {
  return normalizeTenantRol(rol) === "admin";
}
