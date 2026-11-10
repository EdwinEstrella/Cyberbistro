import { getFiscalPendingPresentation } from "../../../shared/lib/salesFiscalUiAdapter";

export interface EcfStatusPresentation {
  label: string;
  color: string;
  bg: string;
}

export const ECF_DELAY_THRESHOLD_MS = 5 * 60 * 1000;
export const ECF_DELAY_HINT_TEXT = "Demorada: si sigue así avisá a soporte";

export function getEcfStatusDisplay(status: string): EcfStatusPresentation {
  switch (status) {
    case "pending_offline":
    case "pending_sync":
      return { label: getFiscalPendingPresentation("dgii_ecf").label, color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
    case "queued":
      return { label: "e-CF: En cola de firma", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" };
    case "signed":
      return { label: "e-CF: Firmada, enviando a la DGII", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" };
    case "submitted":
      return { label: "e-CF: Enviado a DGII", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" };
    case "accepted":
      return { label: "e-CF: Aceptado", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" };
    case "rejected":
      return { label: "e-CF: Rechazado", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" };
    case "retryable_error":
    case "terminal_error":
      return { label: "e-CF: Error fiscal", color: "#f97316", bg: "rgba(249, 115, 22, 0.1)" };
    default:
      return { label: `e-CF: ${status}`, color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
  }
}

export function shouldShowEcfDelayHint(
  status: string,
  timestamp?: string | number | Date | null,
  now: number | Date = Date.now()
): boolean {
  if (status !== "queued" && status !== "signed") {
    return false;
  }
  if (!timestamp) {
    return false;
  }
  const timeMs = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  if (Number.isNaN(timeMs)) {
    return false;
  }
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ageMs = nowMs - timeMs;
  return ageMs > ECF_DELAY_THRESHOLD_MS;
}

export function isEcfDocumentDelayed(
  doc?: { status?: string | null; updated_at?: string | null; created_at?: string | null } | null,
  now?: number | Date
): boolean {
  if (!doc?.status) return false;
  return shouldShowEcfDelayHint(doc.status, doc.updated_at || doc.created_at, now);
}
