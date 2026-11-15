/**
 * Single definition of "DGII rejected this e-CF", shared by the receipt templates and the
 * fiscal print gate so they can never disagree.
 *
 * `rejected` is the status DGII answered with; `terminal_error` is what the fiscal worker
 * persists when DGII refuses the document for good (e.g. "RNC Emisor sin postulacion activa").
 * Both mean the comprobante has no fiscal validity.
 */
const REJECTED_STATUSES: ReadonlySet<string> = new Set(["rejected", "terminal_error"]);

export function isEcfRejectedStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  return REJECTED_STATUSES.has(status.trim().toLowerCase());
}

/** DGII statuses that mean the comprobante is fiscally valid and safe to hand to the customer. */
const ACCEPTED_STATUSES: ReadonlySet<string> = new Set(["accepted", "accepted_conditional"]);

export function isEcfAcceptedStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  return ACCEPTED_STATUSES.has(status.trim().toLowerCase());
}
