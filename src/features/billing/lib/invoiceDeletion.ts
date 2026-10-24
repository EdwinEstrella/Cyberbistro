export const ECF_DELETE_BLOCKED_MESSAGE =
  "Esta factura es un comprobante electrónico (e-CF) y no se puede eliminar. Para anularla, emití una nota de crédito desde Notas de crédito.";

interface InvoiceDeletionFields {
  ncf?: string | null;
  fiscal_mode?: string | null;
}

/**
 * True when the invoice carries (or will carry) an e-CF: it was reported to the
 * DGII, so it can only be reversed with a credit note, never hard-deleted.
 */
export function isEcfInvoice(invoice: InvoiceDeletionFields & { estado?: string | null }, hasEcfDocument = false): boolean {
  if (hasEcfDocument) return true;
  if (invoice.fiscal_mode === "dgii_ecf") return true;
  return /^E\d{2}/i.test(String(invoice.ncf ?? "").trim());
}
