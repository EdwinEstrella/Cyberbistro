import { buildFacturaReceiptHtml } from "./receiptTemplates";
import { readLocalMirror } from "./localFirst";
import { cacheLogoFromUrl } from "./logoCache";
import { supabase } from "./supabase";
import { getThermalPrintSettings } from "./thermalStorage";
import { printThermalHtml, type PrintThermalResult } from "./thermalPrint";

type ReceiptTenant = {
  nombre_negocio: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  logo_url: string | null;
  menu_url?: string | null;
  moneda?: string | null;
  ecf_environment?: "test" | "certification" | "production" | null;
  logo_size_px?: number | null;
  logo_offset_x?: number | null;
  logo_offset_y?: number | null;
};

export async function loadReceiptTenantForPrint(tenantId: string): Promise<ReceiptTenant | null> {
  const localTenants = await readLocalMirror<ReceiptTenant & { id: string }>(tenantId, "tenants").catch(() => []);
  const localTenant = localTenants.find((tenant) => tenant.id === tenantId);
  if (localTenant) return localTenant;

  // A remote read is only a recovery path when the local tenant mirror is absent.
  const { data, error } = await supabase
    .from("tenants")
    .select("nombre_negocio, rnc, direccion, telefono, logo_url, menu_url, moneda, ecf_environment, logo_size_px, logo_offset_x, logo_offset_y")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data as ReceiptTenant | null;
}

async function loadLocalEcfDocument(tenantId: string, facturaId: string): Promise<Record<string, unknown> | null> {
  const localDocuments = await readLocalMirror<Record<string, unknown>>(tenantId, "ecf_documents").catch(() => []);
  return localDocuments.find((document) => document.factura_id === facturaId) ?? null;
}

export async function printLocalInvoiceReceipt(args: {
  tenantId: string;
  factura: Record<string, unknown>;
  numeroFactura: number;
}): Promise<PrintThermalResult> {
  try {
    const [tenant, ecfDocument] = await Promise.all([
      loadReceiptTenantForPrint(args.tenantId),
      loadLocalEcfDocument(args.tenantId, String(args.factura.id ?? "")),
    ]);
    if (!tenant) {
      return { ok: false, error: "No se encontró información del tenant para imprimir." };
    }

    void cacheLogoFromUrl(tenant.logo_url);
    const paperWidthMm = getThermalPrintSettings().paperWidthMm;
    const html = await buildFacturaReceiptHtml(
      {
        nombre_negocio: tenant.nombre_negocio,
        rnc: tenant.rnc,
        direccion: tenant.direccion,
        telefono: tenant.telefono,
        logo_url: tenant.logo_url,
        ecf_environment: tenant.ecf_environment ?? "certification",
        menu_url: tenant.menu_url,
        moneda: tenant.moneda || "DOP",
        logo_size_px: tenant.logo_size_px,
        logo_offset_x: tenant.logo_offset_x,
        logo_offset_y: tenant.logo_offset_y,
      },
      {
        ...args.factura,
        ecf_status: ecfDocument?.status ?? args.factura.fiscal_status ?? null,
        ecf_track_id: ecfDocument?.dgii_track_id ?? null,
        ecf_security_code: ecfDocument?.dgii_security_code ?? null,
        ecf_submitted_at: ecfDocument?.submitted_at ?? null,
      } as Parameters<typeof buildFacturaReceiptHtml>[1],
      args.numeroFactura,
      paperWidthMm
    );

    return printThermalHtml(html, { printType: "sales" });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
