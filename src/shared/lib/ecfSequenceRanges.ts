/**
 * e-NCF range persistence helpers (pure).
 *
 * Storage shape (backward compatible):
 * - `tenants.ncf_secuencias_por_tipo`  { E31: <next number> }  unchanged; read/incremented by the
 *   POS and by the `cloudix_reserve_ecf` RPC, which casts the value to integer.
 * - `tenants.ecf_secuencias_rangos`    { E31: { start, end } }  new; only the authorized range bounds.
 * "Used" is derived as `next - start`, so there is a single counter and no drift.
 */

export interface EcfRange {
  start: number;
  end: number;
  used: number;
}

export interface EcfStoredBounds {
  start: number;
  end: number;
}

export const DEFAULT_ECF_RANGE_SIZE = 1000;
/** Warn when fewer than this share of the authorized range remains. */
export const ECF_LOW_REMAINING_RATIO = 0.1;

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Parses `ecf_secuencias_rangos`, dropping malformed entries. */
export function parseStoredBounds(raw: unknown): Record<string, EcfStoredBounds> {
  if (!isRecord(raw)) return {};
  const out: Record<string, EcfStoredBounds> = {};
  for (const [type, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const start = positiveInt(value.start);
    const end = positiveInt(value.end);
    if (start != null && end != null && end >= start) out[type] = { start, end };
  }
  return out;
}

/** Parses `ncf_secuencias_por_tipo` into next numbers, accepting numbers and `{ secuencia_actual }`. */
export function parseNextNumbers(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [type, value] of Object.entries(raw)) {
    const n = positiveInt(isRecord(value) ? value.secuencia_actual : value);
    if (n != null) out[type] = n;
  }
  return out;
}

/**
 * Rebuilds the wizard state from persisted data. Types with stored bounds restore start/end/used;
 * types that only have a next number (legacy, saved before ranges existed) fall back to the old
 * behaviour: start = next, default size, nothing used.
 */
export function restoreRanges(
  codes: readonly string[],
  nextRaw: unknown,
  boundsRaw: unknown
): Record<string, EcfRange> {
  const next = parseNextNumbers(nextRaw);
  const bounds = parseStoredBounds(boundsRaw);
  const out: Record<string, EcfRange> = {};
  for (const code of codes) {
    const b = bounds[code];
    const n = next[code];
    if (b) {
      const current = n ?? b.start;
      out[code] = { start: b.start, end: b.end, used: Math.max(0, current - b.start) };
    } else if (n != null) {
      out[code] = { start: n, end: n + DEFAULT_ECF_RANGE_SIZE - 1, used: 0 };
    }
  }
  return out;
}

export interface EcfRangeValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  next: number;
  remaining: number;
}

export function validateEcfRange(type: string, range: EcfRange): EcfRangeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const next = range.start + range.used;
  const total = range.end - range.start + 1;
  const remaining = Math.max(0, range.end - next + 1);

  if (!Number.isInteger(range.start) || range.start < 1) {
    errors.push(`${type}: el número inicial debe ser un entero mayor o igual a 1.`);
  } else if (!Number.isInteger(range.end) || range.end < range.start) {
    errors.push(`${type}: el número final debe ser mayor o igual al inicial.`);
  } else if (!Number.isInteger(range.used) || range.used < 0 || next > range.end + 1) {
    errors.push(`${type}: el siguiente número queda fuera del rango autorizado.`);
  } else if (next > range.end) {
    errors.push(`${type}: el rango está agotado. Solicitá un nuevo rango a la DGII.`);
  } else if (remaining < total * ECF_LOW_REMAINING_RATIO) {
    warnings.push(`${type}: quedan ${remaining} comprobantes (menos del 10% del rango). Solicitá un nuevo rango pronto.`);
  }

  return { valid: errors.length === 0, errors, warnings, next, remaining };
}

export interface RangesSavePayload {
  ncf_secuencias_por_tipo: Record<string, number>;
  ecf_secuencias_rangos: Record<string, EcfStoredBounds>;
}

/**
 * Builds the payload to persist. Entries for types not being edited are preserved so saving the
 * wizard never erases other types' ranges or counters.
 */
export function buildRangesSavePayload(
  enabledTypes: readonly string[],
  ranges: Record<string, EcfRange>,
  existingNextRaw: unknown,
  existingBoundsRaw: unknown
): RangesSavePayload {
  const next = { ...parseNextNumbers(existingNextRaw) };
  const bounds = { ...parseStoredBounds(existingBoundsRaw) };
  for (const type of enabledTypes) {
    const range = ranges[type];
    if (!range) continue;
    next[type] = range.start + range.used;
    bounds[type] = { start: range.start, end: range.end };
  }
  return { ncf_secuencias_por_tipo: next, ecf_secuencias_rangos: bounds };
}
