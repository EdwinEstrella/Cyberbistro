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
