export type CreditNoteStatusTone = "neutral" | "warning" | "info" | "success" | "danger";

export interface CreditNoteStatusDisplay {
  label: string;
  tone: CreditNoteStatusTone;
}

/** User-facing fiscal status of an E34 (ecf_documents.status / facturas.fiscal_status). */
export function getCreditNoteStatusDisplay(status: string | null | undefined): CreditNoteStatusDisplay {
  switch (status) {
    case "accepted":
      return { label: "Aceptada", tone: "success" };
    case "rejected":
      return { label: "Rechazada", tone: "danger" };
    case "submitted":
      return { label: "Enviada", tone: "info" };
    case "queued":
    case "signed":
    case "pending_sync":
    case "pending_offline":
      return { label: "En cola", tone: "warning" };
    case "retryable_error":
    case "terminal_error":
      return { label: "Error fiscal", tone: "danger" };
    default:
      return { label: "En cola", tone: "neutral" };
  }
}
