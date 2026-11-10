import { shouldReadLocalFirst, readLocalMirror } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";
import { isCreditNoteInvoice } from "../../../shared/lib/invoiceKind";
import { normalizeDgiiRnc } from "./dgiiHelpers";
import {
  INVOICE_RANGE_LOAD_ERROR,
  normalizeInvoice,
  readLocalInvoices,
  type ReadInvoicesOptions,
} from "../../billing/lib/invoicesLocal";
import {
  buildFormato607Rows,
  consumoSummary,
  type ConsumoSummaryResult,
  type Formato607InvoiceInput,
  type VentaFiscal607,
} from "./formato607";

export interface Formato607DataResult {
  emitterRnc: string;
  rows: VentaFiscal607[];
  summary: ConsumoSummaryResult;
}

export interface Formato607DataOptions {
  readInvoices?: (
    tenantId: string,
    options?: ReadInvoicesOptions
  ) => Promise<Array<Record<string, unknown>>>;
  getEmitterRnc?: (tenantId: string) => Promise<string>;
  fetchParentInvoices?: (
    tenantId: string,
    parentIds: string[]
  ) => Promise<Array<Record<string, unknown>>>;
}

/**
 * Computes the month bounds as UTC instants from the Dominican month:
 * start = `${YYYY}-${MM}-01T04:00:00.000Z`, end = first day of next month `T03:59:59.999Z`.
 * Widens the lower bound on created_at by 7 days to account for table invoices paid after creation.
 */
export function computeFormato607MonthBounds(period: string): { dateFrom: string; dateTo: string } {
  if (!/^\d{6}$/.test(period)) {
    throw new Error("El período debe usar el formato AAAAMM.");
  }
  const year = parseInt(period.slice(0, 4), 10);
  const month = parseInt(period.slice(4, 6), 10);
  if (month < 1 || month > 12) {
    throw new Error("El período debe usar el formato AAAAMM.");
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01T04:00:00.000Z`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T03:59:59.999Z`;

  const dateFrom = new Date(Date.parse(start) - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dateTo = end;

  return { dateFrom, dateTo };
}

/**
 * Collects credit_note_of IDs for credit notes whose cliente_rnc is empty
 * and whose parent invoice is not among the loaded invoices.
 */
export function collectMissingParentInvoiceIds(
  invoices: Formato607InvoiceInput[]
): string[] {
  const loadedIds = new Set<string>();
  for (const inv of invoices) {
    if (inv.id) loadedIds.add(String(inv.id));
  }

  const missingIds = new Set<string>();
  for (const inv of invoices) {
    if (isCreditNoteInvoice(inv) && !inv.cliente_rnc?.trim() && inv.credit_note_of) {
      const parentId = String(inv.credit_note_of);
      if (!loadedIds.has(parentId)) {
        missingIds.add(parentId);
      }
    }
  }

  return Array.from(missingIds);
}

/**
 * Default parent invoices fetcher: on desktop uses SQLite store, on web uses Supabase chunked IN query.
 */
export async function defaultFetchParentInvoices(
  tenantId: string,
  parentIds: string[]
): Promise<Array<Record<string, unknown>>> {
  if (parentIds.length === 0) return [];

  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (api?.listInvoices) {
    try {
      const res = await api.listInvoices({ tenantId });
      if (res?.ok && Array.isArray(res.data)) {
        const idSet = new Set(parentIds);
        return res.data.filter((r) => idSet.has(String(r.id)));
      }
    } catch (err) {
      console.warn("[formato607Data] Failed to fetch parent invoices from desktop store:", err);
    }
    return [];
  }

  const chunkSize = 50;
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < parentIds.length; i += chunkSize) {
    const chunk = parentIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("facturas")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", chunk);
    if (error) {
      console.warn("[formato607Data] Failed to fetch parent invoices chunk:", error);
      continue;
    }
    if (data) results.push(...(data as Array<Record<string, unknown>>));
  }
  return results;
}

/**
 * Fetches the tenant emitter RNC using local mirror if available, or cloud tenants table.
 */
export async function fetchTenantEmitterRnc(tenantId: string): Promise<string> {
  const useLocal = await shouldReadLocalFirst(tenantId, ["tenants"]);
  if (useLocal) {
    const localTenants = await readLocalMirror<{ id: string; rnc: string | null }>(tenantId, "tenants");
    return localTenants.find((t) => t.id === tenantId)?.rnc || "";
  }
  const { data, error } = await supabase.from("tenants").select("rnc").eq("id", tenantId).maybeSingle();
  if (error) {
    throw new Error("No se pudo leer el RNC de tu negocio. Verificá tu conexión e intentá de nuevo.");
  }
  return data?.rnc || "";
}

/**
 * Pure data-assembly function: normalizes raw invoices (from SQLite or Supabase),
 * validates emitter RNC and period, and produces the 607 detail rows and consumo summary.
 * parentInvoices are used solely for credit-note buyer ID resolution and NEVER emitted as detail rows.
 */
export function assembleFormato607Data(
  rawInvoices: Array<Record<string, unknown>>,
  emitterRnc: string,
  period: string,
  rawParentInvoices: Array<Record<string, unknown>> = []
): Formato607DataResult {
  const normalizedRnc = normalizeDgiiRnc(emitterRnc);
  if (normalizedRnc.length !== 9 && normalizedRnc.length !== 11) {
    throw new Error(
      "Falta el RNC de tu negocio. Configurá el RNC o cédula de tu restaurante (el emisor del reporte) en la pantalla de Ajustes antes de exportar."
    );
  }
  if (!/^\d{6}$/.test(period)) {
    throw new Error("El período debe usar el formato AAAAMM.");
  }

  const normalized = rawInvoices.map((raw) => normalizeInvoice(raw) as unknown as Formato607InvoiceInput);
  const normalizedParents = rawParentInvoices.map((raw) => normalizeInvoice(raw) as unknown as Formato607InvoiceInput);
  const rows = buildFormato607Rows(normalized, period, normalizedParents);
  const summary = consumoSummary(normalized, period);

  return {
    emitterRnc: normalizedRnc,
    rows,
    summary,
  };
}

/**
 * Orchestrates fetching invoices and emitter RNC for the tenant, then assembling the 607 payload.
 * Invoices are loaded within range bounds (UTC instants derived from the Dominican calendar month,
 * with a 7-day lower pad on created_at).
 * If any invoice load error occurs, throws INVOICE_RANGE_LOAD_ERROR.
 * If RNC lookup fails, its own error is propagated.
 */
export async function loadFormato607Data(
  tenantId: string,
  period: string,
  options: Formato607DataOptions = {}
): Promise<Formato607DataResult> {
  const { dateFrom, dateTo } = computeFormato607MonthBounds(period);
  const getRnc = options.getEmitterRnc ?? fetchTenantEmitterRnc;
  const readInvs = options.readInvoices ?? readLocalInvoices;
  const fetchParents = options.fetchParentInvoices ?? defaultFetchParentInvoices;

  const readInvoicesSafe = async () => {
    try {
      return await readInvs(tenantId, { dateFrom, dateTo });
    } catch {
      throw new Error(INVOICE_RANGE_LOAD_ERROR);
    }
  };

  const [rawInvoices, rawRnc] = await Promise.all([
    readInvoicesSafe(),
    getRnc(tenantId),
  ]);

  const normalizedInvoices = rawInvoices.map(
    (raw) => normalizeInvoice(raw) as unknown as Formato607InvoiceInput
  );
  const missingParentIds = collectMissingParentInvoiceIds(normalizedInvoices);

  let rawParentInvoices: Array<Record<string, unknown>> = [];
  if (missingParentIds.length > 0) {
    try {
      rawParentInvoices = await fetchParents(tenantId, missingParentIds);
    } catch (err) {
      console.warn("[formato607Data] Failed to resolve parent invoices:", err);
    }
  }

  return assembleFormato607Data(rawInvoices, rawRnc, period, rawParentInvoices);
}
