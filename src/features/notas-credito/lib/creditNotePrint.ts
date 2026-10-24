import { supabase } from "../../../shared/lib/supabase";
import { printLocalInvoiceReceipt } from "../../../shared/lib/localInvoiceReceipt";
import type { PrintThermalResult } from "../../../shared/lib/thermalPrint";

/** Cloud fallback for the fiscal state (security code, signature date); null when unavailable. */
async function loadCloudEcfDocument(tenantId: string, facturaId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from("ecf_documents")
      .select("status, dgii_track_id, dgii_security_code, submitted_at")
      .eq("tenant_id", tenantId)
      .eq("factura_id", facturaId)
      .maybeSingle();
    return error ? null : ((data as Record<string, unknown> | null) ?? null);
  } catch {
    return null;
  }
}

async function loadCloudNote(tenantId: string, noteId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.from("facturas").select("*").eq("tenant_id", tenantId).eq("id", noteId).maybeSingle();
    return error ? null : ((data as Record<string, unknown> | null) ?? null);
  } catch {
    return null;
  }
}

/**
 * Prints an E34 credit note at the configured thermal width. Pass the loaded row (reprint) or just its
 * id (right after issuing, when the row may not have reached the local mirror yet).
 * The receipt builder routes the row to the E34 layout.
 */
export async function printCreditNote(args: {
  tenantId: string;
  note?: Record<string, unknown>;
  noteId?: string;
}): Promise<PrintThermalResult> {
  const note = args.note ?? (args.noteId ? await loadCloudNote(args.tenantId, args.noteId) : null);
  if (!note) return { ok: false, error: "No se encontró la nota de crédito a imprimir." };
  const ecfDocument = await loadCloudEcfDocument(args.tenantId, String(note.id ?? ""));
  return printLocalInvoiceReceipt({
    tenantId: args.tenantId,
    factura: note,
    numeroFactura: Number(note.numero_factura ?? 0),
    ecfDocument,
  });
}
