/** Maximum number of invoices a free-text search returns. */
export const INVOICE_SEARCH_LIMIT = 200;

/** Minimum digits before a query is substring-matched against the RNC / cédula. */
const MIN_RNC_DIGITS = 3;

export interface SearchableInvoice {
  numero_factura?: number | string | null;
  ncf?: string | null;
  cliente_nombre?: string | null;
  cliente_rnc?: string | null;
  notas?: string | null;
  created_at?: string | null;
}

export interface InvoiceSearchResult<T> {
  rows: T[];
  /** True when more than `limit` invoices matched and the list was truncated. */
  capped: boolean;
}

/** Lowercases and strips diacritics so "José" and "jose" compare equal. */
export function normalizeSearchText(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function digitsOnly(value: unknown): string {
  return value == null ? "" : String(value).replace(/\D/g, "");
}

/** Trims and collapses whitespace; an empty result means "no search". */
export function normalizeInvoiceQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

/**
 * Parses "4055", "#4055" or "#004055" into 4055. Returns null unless the query
 * is purely digits once the leading '#' is removed.
 */
export function parseInvoiceNumberQuery(query: string): number | null {
  const stripped = normalizeInvoiceQuery(query).replace(/^#+/, "");
  if (!/^\d+$/.test(stripped)) return null;
  const n = Number.parseInt(stripped, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/** True when ANY searchable field of the invoice matches the query. */
export function invoiceMatchesQuery(invoice: SearchableInvoice, rawQuery: string): boolean {
  const query = normalizeInvoiceQuery(rawQuery);
  if (!query) return false;

  const number = parseInvoiceNumberQuery(query);
  if (number !== null && Number(invoice.numero_factura) === number) return true;

  const lower = query.toLowerCase();
  if (invoice.ncf && String(invoice.ncf).toLowerCase().includes(lower)) return true;

  const accentless = normalizeSearchText(query);
  if (accentless) {
    if (normalizeSearchText(invoice.cliente_nombre).includes(accentless)) return true;
    if (normalizeSearchText(invoice.notas).includes(accentless)) return true;
  }

  const queryDigits = digitsOnly(query);
  if (queryDigits.length >= MIN_RNC_DIGITS && digitsOnly(invoice.cliente_rnc).includes(queryDigits)) {
    return true;
  }
  return false;
}

function createdAtMs(invoice: SearchableInvoice): number {
  const t = new Date(String(invoice.created_at ?? 0)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** True when the invoice carries a non-blank NCF. */
export function hasNcf(invoice: { ncf?: string | null }): boolean {
  return typeof invoice.ncf === "string" && invoice.ncf.trim() !== "";
}

/** Keeps only invoices with an NCF when `onlyWithNcf` is set; otherwise returns the input. */
export function filterOnlyWithNcf<T extends { ncf?: string | null }>(invoices: T[], onlyWithNcf: boolean): T[] {
  return onlyWithNcf ? invoices.filter(hasNcf) : invoices;
}

/** Filters invoices by the query, newest first, capped at `limit`. */
export function searchInvoices<T extends SearchableInvoice>(
  invoices: T[],
  query: string,
  limit: number = INVOICE_SEARCH_LIMIT,
  options: { onlyWithNcf?: boolean } = {},
): InvoiceSearchResult<T> {
  if (!normalizeInvoiceQuery(query)) return { rows: [], capped: false };
  const matches = filterOnlyWithNcf(invoices, !!options.onlyWithNcf)
    .filter((inv) => invoiceMatchesQuery(inv, query))
    .sort((a, b) => createdAtMs(b) - createdAtMs(a));
  return { rows: matches.slice(0, limit), capped: matches.length > limit };
}

/**
 * Removes characters that could break out of a PostgREST `or(...)` expression
 * (commas, parentheses, wildcards, backslashes, quotes, percent signs) and
 * collapses whitespace.
 */
export function sanitizeInvoiceQueryForPostgrest(query: string): string {
  return query
    .replace(/[,()*\\%"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds the `.or()` filter string for the web search, or null when nothing
 * searchable is left after sanitizing.
 */
export function buildInvoiceSearchOrFilter(rawQuery: string): string | null {
  const q = sanitizeInvoiceQueryForPostgrest(rawQuery);
  if (!q) return null;
  const parts = [
    `ncf.ilike.*${q}*`,
    `cliente_nombre.ilike.*${q}*`,
    `cliente_rnc.ilike.*${q}*`,
    `notas.ilike.*${q}*`,
  ];
  const digits = digitsOnly(q);
  if (digits.length >= MIN_RNC_DIGITS && digits !== q) parts.push(`cliente_rnc.ilike.*${digits}*`);
  const number = parseInvoiceNumberQuery(q);
  if (number !== null) parts.push(`numero_factura.eq.${number}`);
  return parts.join(",");
}
