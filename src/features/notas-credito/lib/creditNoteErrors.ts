/** DGII RazonModificacion limit. */
export const CREDIT_NOTE_REASON_MAX_LENGTH = 90;

export type ReasonValidation = { ok: true; value: string } | { ok: false; message: string };

export function validateCreditNoteReason(raw: string): ReasonValidation {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Escribí el motivo de la nota de crédito." };
  if (value.length > CREDIT_NOTE_REASON_MAX_LENGTH) {
    return { ok: false, message: `El motivo no puede pasar de ${CREDIT_NOTE_REASON_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, value };
}

const GENERIC_MESSAGE = "No se pudo emitir la nota de crédito. Intentá de nuevo.";

const ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["CREDIT_NOTE_FORBIDDEN", "Solo los administradores pueden emitir notas de crédito."],
  ["CREDIT_NOTE_REASON_REQUIRED", "Escribí el motivo de la nota de crédito."],
  ["CREDIT_NOTE_ORIGINAL_NOT_FOUND", "La factura original no existe en la nube. Esperá a que sincronice e intentá de nuevo."],
  ["CREDIT_NOTE_ORIGINAL_IS_CREDIT_NOTE", "No se puede emitir una nota de crédito sobre otra nota de crédito."],
  ["CREDIT_NOTE_TYPE_NOT_ALLOWED", "Solo se pueden acreditar facturas e-CF de tipo E31 o E32."],
  ["CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED", "La DGII aún no aceptó la factura original."],
  ["CREDIT_NOTE_ALREADY_EXISTS", "Esta factura ya tiene una nota de crédito."],
  ["CREDIT_NOTE_CREDIT_SALE_UNSUPPORTED", "Las ventas a crédito (fiado) todavía no admiten notas de crédito."],
  ["CREDIT_NOTE_WINDOW_EXPIRED", "Pasaron más de 30 días desde la emisión de la factura."],
  ["CREDIT_NOTE_NO_OPEN_CYCLE", "Abrí la caja primero: el dinero de la devolución sale de la caja del turno actual."],
  ["ECF_RANGE_NOT_CONFIGURED", "No hay un rango de secuencias E34 configurado. Pedí al soporte que lo habilite."],
  ["ECF_RANGE_EXHAUSTED", "Se agotó el rango de secuencias E34 autorizado por la DGII."],
  ["NCF fiscal no esta activo", "El NCF fiscal no está activo para este negocio."],
  ["insufficient_privilege", "No tenés permiso para emitir notas de crédito."],
];

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { message, details, hint } = error as Record<string, unknown>;
    return [message, details, hint].filter((part) => typeof part === "string").join(" ");
  }
  return "";
}

/** Maps a cloudix_issue_credit_note RPC failure to a user message in Spanish. */
export function mapCreditNoteError(error: unknown): string {
  const text = errorText(error);
  for (const [needle, message] of ERROR_MESSAGES) {
    if (text.includes(needle)) return message;
  }
  if (/failed to fetch|networkerror|network request failed|offline|timeout|abort/i.test(text)) {
    return "Sin conexión con la nube. Revisá tu conexión e intentá de nuevo.";
  }
  return GENERIC_MESSAGE;
}
