/**
 * Typed errors for the authorized e-NCF range enforced by `cloudix_reserve_ecf` (and mirrored
 * offline). The sale must never fall back to another fiscal mode on these errors, so they carry a
 * Spanish message with the action the user has to take.
 */
import { parseStoredBounds } from "./ecfSequenceRanges";

export type EcfRangeErrorCode = "ECF_RANGE_NOT_CONFIGURED" | "ECF_RANGE_EXHAUSTED";

export class EcfRangeError extends Error {
  readonly code: EcfRangeErrorCode;
  readonly tipo: string;
  readonly end: number | null;

  constructor(code: EcfRangeErrorCode, tipo: string, end: number | null = null) {
    super(ecfRangeErrorMessage(code, tipo, end));
    this.name = "EcfRangeError";
    this.code = code;
    this.tipo = tipo;
    this.end = end;
  }
}

export function ecfRangeErrorMessage(code: EcfRangeErrorCode, tipo: string, end: number | null): string {
  if (code === "ECF_RANGE_NOT_CONFIGURED") {
    return `No hay un rango autorizado de ${tipo} configurado. Cargá el rango aprobado por la DGII en Facturación electrónica → Activación.`;
  }
  const upTo = end != null ? ` (hasta ${end})` : "";
  return `Se agotó el rango autorizado de ${tipo}${upTo}. Solicitá un nuevo rango en la Oficina Virtual de la DGII y cargalo en Activación.`;
}

/** Maps an RPC error (`message`/`details`) to a typed range error, or null when it is something else. */
export function mapEcfRangeRpcError(
  error: { message?: string | null; details?: string | null } | null | undefined,
  fallbackTipo: string
): EcfRangeError | null {
  const message = error?.message ?? "";
  const details = error?.details ?? "";
  const code: EcfRangeErrorCode | null = message.includes("ECF_RANGE_EXHAUSTED")
    ? "ECF_RANGE_EXHAUSTED"
    : message.includes("ECF_RANGE_NOT_CONFIGURED")
      ? "ECF_RANGE_NOT_CONFIGURED"
      : null;
  if (!code) return null;
  // DETAIL is "<tipo>" or "<tipo>:<end>".
  const [tipoRaw, endRaw] = details.split(":");
  const tipo = tipoRaw?.trim() || fallbackTipo;
  const endNum = endRaw != null ? Number(endRaw) : NaN;
  return new EcfRangeError(code, tipo, Number.isInteger(endNum) ? endNum : null);
}

/**
 * Offline equivalent of the RPC range check for an e-CF type. Returns the sequence to use
 * (raising it to `start` when the counter is behind) or throws the same typed errors.
 */
export function enforceEcfRangeLocally(args: {
  tipo: string;
  currentSequence: number;
  boundsRaw: unknown;
}): number {
  const bounds = parseStoredBounds(args.boundsRaw)[args.tipo];
  if (!bounds) throw new EcfRangeError("ECF_RANGE_NOT_CONFIGURED", args.tipo);
  const current = Math.max(args.currentSequence, bounds.start);
  if (current > bounds.end) throw new EcfRangeError("ECF_RANGE_EXHAUSTED", args.tipo, bounds.end);
  return current;
}

/**
 * Detects a range error even when the typed instance was lost (re-thrown as a plain Error, stored
 * as a string in the outbox, or a raw RPC error) by looking at `code` and the message text.
 * Returns the user-facing message to keep, or null when the error is not a range error.
 */
export function ecfRangeTerminalMessage(err: unknown): string | null {
  if (err instanceof EcfRangeError) return err.message;
  if (err == null) return null;
  const record = typeof err === "object" ? (err as { code?: unknown; message?: unknown; details?: unknown }) : null;
  const message = typeof err === "string" ? err : typeof record?.message === "string" ? record.message : "";
  const details = typeof record?.details === "string" ? record.details : null;
  const hasCode = record?.code === "ECF_RANGE_NOT_CONFIGURED" || record?.code === "ECF_RANGE_EXHAUSTED";
  const mapped = mapEcfRangeRpcError({ message: hasCode ? String(record?.code) : message, details }, "e-CF");
  if (!mapped) return null;
  // A plain Error already carrying the Spanish text keeps it; a raw code gets the friendly one.
  return message && !message.includes(mapped.code) ? message : mapped.message;
}
