import { supabase } from "./supabase";
import { readLocalMirror } from "./localFirst";
import { getThermalPrintSettings } from "./thermalStorage";
import { printThermalHtml, type PrintThermalResult } from "./thermalPrint";
import {
  buildDispatchSlipHtml,
  type DispatchSlipReceiptData,
  type TenantReceiptInfo,
} from "./receiptTemplates";
import { isDesktopCloudUnavailable } from "./cloudAvailability";
import { resolveKitchenPrintTenant } from "./kitchenPrintTenant";

export type { DispatchSlipReceiptData };

/**
 * Sends a dispatch slip to the sales/register thermal printer ({ printType: "sales" })
 * when kitchen_enabled is false.
 * Respects thermal setting printComandas (if false, returns null and skips print).
 */
export async function printDispatchSlip(
  tenantId: string | null | undefined,
  slip: DispatchSlipReceiptData
): Promise<PrintThermalResult | null> {
  if (!tenantId) return null;
  const printSettings = getThermalPrintSettings();
  if (printSettings.printComandas === false) return null;

  let isOffline = false;
  try {
    isOffline =
      (typeof navigator !== "undefined" && !navigator.onLine) ||
      (await isDesktopCloudUnavailable().catch(() => true));
  } catch {
    isOffline = true;
  }

  const tenantRow: TenantReceiptInfo = await resolveKitchenPrintTenant({
    cloudUnavailable: isOffline,
    fetchCloud: async (columns) =>
      await supabase.from("tenants").select(columns).eq("id", tenantId).single(),
    readLocal: async () => {
      const rows = await readLocalMirror<TenantReceiptInfo & { id?: string }>(
        tenantId,
        "tenants"
      ).catch(() => []);
      return rows.find((row) => row.id === tenantId) ?? null;
    },
  });

  const html = buildDispatchSlipHtml(tenantRow, slip, printSettings.paperWidthMm);
  const printRes = await printThermalHtml(html, { printType: "sales" });
  if (!printRes.ok) {
    console.warn("Impresión papelito de pedido:", printRes.error);
  }
  return printRes;
}
