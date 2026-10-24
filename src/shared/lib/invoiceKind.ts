/** `facturas.estado` of an E34 credit note row (it reverses a sale; it is never a sale). */
export const CREDIT_NOTE_ESTADO = "nota_credito";

interface InvoiceKindFields {
  estado?: string | null;
  credit_note_of?: string | null;
}

/** True for an e-CF credit note row (estado nota_credito or a reference to its original invoice). */
export function isCreditNoteInvoice(invoice: InvoiceKindFields | null | undefined): boolean {
  if (!invoice) return false;
  if (invoice.estado === CREDIT_NOTE_ESTADO) return true;
  return typeof invoice.credit_note_of === "string" && invoice.credit_note_of.length > 0;
}

/** Predicate for every place a factura is summed as a sale. */
export function isSaleInvoice(invoice: InvoiceKindFields | null | undefined): boolean {
  return !isCreditNoteInvoice(invoice);
}
