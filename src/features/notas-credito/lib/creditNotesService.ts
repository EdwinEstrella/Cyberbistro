import { supabase } from "../../../shared/lib/supabase";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { readLocalInvoices } from "../../billing/lib/invoicesLocal";
import { fetchCloudInvoicesInRange } from "../../billing/lib/invoicesCloud";
import { isCreditNoteInvoice } from "../../../shared/lib/invoiceKind";
import { CREDIT_NOTE_WINDOW_DAYS, isEligibleEcfType, type CreditNoteInvoice } from "./creditNoteEligibility";
import { mapCreditNoteError } from "./creditNoteErrors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Look-back for the lists: the 30-day window plus margin for notes issued later and timezone edges. */
const LOAD_DAYS = CREDIT_NOTE_WINDOW_DAYS + 15;
const ECF_CHUNK = 100;

export interface CreditNoteData {
  invoices: CreditNoteInvoice[];
  ecfByInvoiceId: Map<string, { status?: string | null }>;
}

export interface IssueCreditNoteResult {
  credit_note_factura_id: string;
  encf: string;
  ecf_document_id: string;
  gasto_id: string | null;
}

/** Branch id sent to the RPC: only real uuids (the desktop default branch sentinel means tenant-wide/null). */
export function resolveRpcBranchId(sucursalId: string | null | undefined): string | null {
  return sucursalId && UUID_RE.test(sucursalId) ? sucursalId : null;
}

/** Reads recent facturas with the same path Billing uses (SQLite on desktop, ranged cloud query on web). */
export async function loadCreditNoteData(
  tenantId: string,
  sucursalId: string | null | undefined,
  now: Date = new Date(),
): Promise<CreditNoteData> {
  const fromIso = new Date(now.getTime() - LOAD_DAYS * 86_400_000).toISOString();
  const [localInvoices, localEcf] = await Promise.all([
    shouldReadLocalFirst(tenantId, ["facturas"]),
    shouldReadLocalFirst(tenantId, ["ecf_documents"]),
  ]);

  let rows: Array<Record<string, unknown>>;
  if (localInvoices) {
    rows = (await readLocalInvoices(tenantId, { sucursalId })).filter((r) => String(r.created_at ?? "") >= fromIso);
  } else {
    const res = await fetchCloudInvoicesInRange<Record<string, unknown>>(supabase, tenantId, { sucursalId, fromIso });
    if (res.error) throw res.error;
    rows = res.data;
  }
  const invoices = rows as unknown as CreditNoteInvoice[];

  const ecfByInvoiceId = new Map<string, { status?: string | null }>();
  if (localEcf) {
    const docs = await readLocalMirror<{ factura_id?: string | null; status?: string | null }>(tenantId, "ecf_documents");
    for (const doc of docs) if (doc.factura_id) ecfByInvoiceId.set(String(doc.factura_id), { status: doc.status });
  } else {
    const ids = invoices.filter((i) => isEligibleEcfType(i.ncf) || isCreditNoteInvoice(i)).map((i) => i.id);
    for (let i = 0; i < ids.length; i += ECF_CHUNK) {
      const { data, error } = await supabase
        .from("ecf_documents")
        .select("factura_id, status")
        .eq("tenant_id", tenantId)
        .in("factura_id", ids.slice(i, i + ECF_CHUNK));
      if (error) throw error;
      for (const doc of data ?? []) ecfByInvoiceId.set(String(doc.factura_id), { status: doc.status });
    }
  }
  return { invoices, ecfByInvoiceId };
}

/** Calls the cloud RPC. Throws an Error whose message is already user-facing Spanish. */
export async function issueCreditNote(input: {
  tenantId: string;
  facturaId: string;
  reason: string;
  sucursalId?: string | null;
}): Promise<IssueCreditNoteResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.rpc("cloudix_issue_credit_note", {
      p_tenant_id: input.tenantId,
      p_factura_id: input.facturaId,
      p_razon: input.reason,
      p_sucursal_id: resolveRpcBranchId(input.sucursalId),
    }));
  } catch (thrown) {
    throw new Error(mapCreditNoteError(thrown));
  }
  if (error) throw new Error(mapCreditNoteError(error));
  if (!data || typeof data !== "object") throw new Error(mapCreditNoteError(null));
  return data as IssueCreditNoteResult;
}
