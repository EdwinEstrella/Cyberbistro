/**
 * e-NCF range persistence helpers (pure).
 *
 * Storage shape (backward compatible):
 * - `tenants.ncf_secuencias_por_tipo`  { E31: <next number> }  unchanged; read/incremented by the
 *   POS and by the `cloudix_reserve_ecf` RPC, which casts the value to integer.
 * - `tenants.ecf_secuencias_rangos`    { E31: { start, end, vence? } }  only the authorized range bounds.
 * "Used" is derived as `next - start`, so there is a single counter and no drift.
 */

export interface EcfRange {
  start: number;
  end: number;
  used: number;
  vence?: string;
}

export interface EcfStoredBounds {
  start: number;
  end: number;
  vence?: string;
  [key: string]: unknown;
}

export const DEFAULT_ECF_RANGE_SIZE = 1000;
/** Warn when fewer than this share of the authorized range remains. */
export const ECF_LOW_REMAINING_RATIO = 0.1;
export const EXPIRY_WARNING_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Keep consistent with ECF_TYPES_WITH_SEQUENCE_EXPIRY in worker/fiscal/mapper.ts
export const ECF_TYPES_REQUIRING_EXPIRY = ["E31", "E33", "E41", "E43", "E44", "E45", "E46", "E47"] as const;

export function ecfTypeRequiresExpiry(type: string): boolean {
  return (ECF_TYPES_REQUIRING_EXPIRY as readonly string[]).includes(type);
}

/**
 * Parses a strict dd-MM-yyyy date string (trimmed) and checks calendar validity (year 2000-2100).
 * Matches worker isValidDgiiDateFormat in worker/fiscal/mapper.ts.
 */
function parseExpiry(value: string): { day: number; month: number; year: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return { day, month, year };
}

/**
 * Validates strict dd-MM-yyyy format and real calendar date.
 */
export function isValidExpiryDate(dateStr: string): boolean {
  return parseExpiry(dateStr) !== null;
}

/**
 * Converts dd-MM-yyyy to yyyy-MM-dd for <input type="date">.
 * Returns "" for invalid input.
 */
export function expiryToInputValue(expiry: string): string {
  const parsed = parseExpiry(expiry);
  if (!parsed) return "";
  const dd = String(parsed.day).padStart(2, "0");
  const mm = String(parsed.month).padStart(2, "0");
  const yyyy = String(parsed.year);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts yyyy-MM-dd from <input type="date"> to dd-MM-yyyy.
 * Returns null for invalid or empty input.
 */
export function inputValueToExpiry(inputValue: string): string | null {
  if (typeof inputValue !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inputValue.trim());
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  const candidate = `${dd}-${mm}-${yyyy}`;
  return isValidExpiryDate(candidate) ? candidate : null;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Parses `ecf_secuencias_rangos`, dropping malformed entries and preserving unknown keys & valid vence. */
export function parseStoredBounds(raw: unknown): Record<string, EcfStoredBounds> {
  if (!isRecord(raw)) return {};
  const out: Record<string, EcfStoredBounds> = {};
  for (const [type, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const start = positiveInt(value.start);
    const end = positiveInt(value.end);
    if (start != null && end != null && end >= start) {
      const entry: EcfStoredBounds = { ...value, start, end };
      if (typeof value.vence === "string" && isValidExpiryDate(value.vence.trim())) {
        entry.vence = value.vence.trim();
      } else {
        delete entry.vence;
      }
      out[type] = entry;
    }
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
 * Rebuilds the wizard state from persisted data. Types with stored bounds restore start/end/used/vence;
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
      const range: EcfRange = {
        start: b.start,
        end: b.end,
        used: Math.max(0, current - b.start),
      };
      if (b.vence) {
        range.vence = b.vence;
      }
      out[code] = range;
    } else if (n != null) {
      out[code] = { start: n, end: n + DEFAULT_ECF_RANGE_SIZE - 1, used: 0 };
    }
  }
  return out;
}

export interface EcfExpiryValidation {
  error: string | null;
  warning: string | null;
}

export function validateEcfExpiry(
  type: string,
  vence: string | undefined,
  today: Date = new Date()
): EcfExpiryValidation {
  const requiresExpiry = ecfTypeRequiresExpiry(type);
  const rawVence = typeof vence === "string" ? vence.trim() : "";

  if (requiresExpiry && !rawVence) {
    return {
      error: `${type}: indicá la fecha de vencimiento de la secuencia (la DGII la exige).`,
      warning: null,
    };
  }

  if (!rawVence) {
    return { error: null, warning: null };
  }

  const parsed = parseExpiry(rawVence);
  if (!parsed) {
    return {
      error: requiresExpiry
        ? `${type}: indicá la fecha de vencimiento de la secuencia (la DGII la exige).`
        : `${type}: la fecha de vencimiento no es válida. Usá el formato dd-MM-yyyy.`,
      warning: null,
    };
  }

  const expiryUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffDays = Math.round((expiryUtc - todayUtc) / MS_PER_DAY);

  if (diffDays < 0) {
    return {
      error: `${type}: la secuencia venció el ${rawVence}. Solicitá un nuevo rango a la DGII.`,
      warning: null,
    };
  }

  if (diffDays <= EXPIRY_WARNING_DAYS) {
    const daysText = diffDays === 0 ? "hoy" : `en ${diffDays} ${diffDays === 1 ? "día" : "días"}`;
    return {
      error: null,
      warning: `${type}: la secuencia vence el ${rawVence} (${daysText}). Solicitá un nuevo rango pronto.`,
    };
  }

  return { error: null, warning: null };
}

export interface EcfRangeValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  next: number;
  remaining: number;
}

export function validateRangeBounds(type: string, range: EcfRange): EcfRangeValidation {
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

export function validateEcfRange(type: string, range: EcfRange, today: Date = new Date()): EcfRangeValidation {
  const bounds = validateRangeBounds(type, range);
  const errors = [...bounds.errors];
  const warnings = [...bounds.warnings];

  const expiry = validateEcfExpiry(type, range.vence, today);
  if (expiry.error) errors.push(expiry.error);
  if (expiry.warning) warnings.push(expiry.warning);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    next: bounds.next,
    remaining: bounds.remaining,
  };
}

export interface RangesSavePayload {
  ncf_secuencias_por_tipo: Record<string, number>;
  ecf_secuencias_rangos: Record<string, EcfStoredBounds>;
  /** Turned-off e-CF types kept because numbers were already issued from them. */
  keptTypes: string[];
}

/** True when the stored counter shows at least one number was issued for the type. */
function hasIssued(next: number | undefined, bounds: EcfStoredBounds | undefined): boolean {
  if (next == null) return false;
  return next > (bounds?.start ?? 1);
}

/**
 * Builds the payload to persist. `managedTypes` are the e-CF codes the wizard shows: those the user
 * turned off are removed, unless numbers were already issued from them (removing the counter would
 * let a re-added type reuse e-NCF numbers), in which case they are kept and listed in `keptTypes`.
 * Every other entry (legacy NCF counters such as B02) is preserved untouched.
 */
export function buildRangesSavePayload(
  enabledTypes: readonly string[],
  ranges: Record<string, EcfRange>,
  existingNextRaw: unknown,
  existingBoundsRaw: unknown,
  managedTypes: readonly string[] = []
): RangesSavePayload {
  const next = { ...parseNextNumbers(existingNextRaw) };
  const bounds: Record<string, EcfStoredBounds> = {};
  if (isRecord(existingBoundsRaw)) {
    for (const [type, rawEntry] of Object.entries(existingBoundsRaw)) {
      if (isRecord(rawEntry)) {
        bounds[type] = { ...rawEntry } as EcfStoredBounds;
      }
    }
  }
  const parsedBounds = parseStoredBounds(existingBoundsRaw);

  const keptTypes: string[] = [];
  for (const type of managedTypes) {
    if (enabledTypes.includes(type) || (next[type] == null && !bounds[type])) continue;
    if (hasIssued(next[type], parsedBounds[type])) {
      keptTypes.push(type);
      continue;
    }
    delete next[type];
    delete bounds[type];
  }

  for (const type of enabledTypes) {
    const range = ranges[type];
    if (!range) continue;
    next[type] = range.start + range.used;

    const rawEntry = bounds[type] ?? {};
    const vence = range.vence?.trim() || parsedBounds[type]?.vence;
    const updatedEntry: EcfStoredBounds = {
      ...rawEntry,
      start: range.start,
      end: range.end,
    };

    if (vence) {
      updatedEntry.vence = vence;
    } else {
      delete updatedEntry.vence;
    }

    bounds[type] = updatedEntry;
  }

  return { ncf_secuencias_por_tipo: next, ecf_secuencias_rangos: bounds, keptTypes };
}
