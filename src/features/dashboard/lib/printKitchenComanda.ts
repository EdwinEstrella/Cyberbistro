import { supabase } from "../../../shared/lib/supabase";
import { readLocalMirror } from "../../../shared/lib/localFirst";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { buildComandaReceiptHtml } from "../../../shared/lib/receiptTemplates";

/**
 * Prints a kitchen comanda OUT of the "enviar" critical path. It fetches the
 * business header (Supabase when online, the local mirror offline) and sends the
 * ticket to the kitchen printer; on failure it warns without blocking the POS.
 *
 * It is called fire-and-forget AFTER the order already shows on screen, so
 * neither the network fetch nor the (slow) Windows printer enumeration delays
 * the orange items from appearing in the table account.
 *
 * A no-op when comanda printing is disabled in settings.
 */
export async function printKitchenComanda(tid: string, comanda: Record<string, unknown>): Promise<void> {
  if (getThermalPrintSettings().printComandas === false) return;

  let tenantRow: any = null;
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const localTenants = await readLocalMirror<any>(tid, "tenants");
      tenantRow = localTenants.find((t) => t.id === tid);
    } else {
      const { data: t, error } = await supabase
        .from("tenants")
        .select("nombre_negocio, rnc, direccion, telefono, logo_url, menu_url, moneda, logo_size_px, logo_offset_x, logo_offset_y")
        .eq("id", tid)
        .maybeSingle();
      if (error) throw error;
      tenantRow = t;
    }
  } catch {
    const localTenants = await readLocalMirror<any>(tid, "tenants").catch(() => []);
    tenantRow = localTenants.find((t) => t.id === tid);
  }

  if (!tenantRow) {
    console.warn("Impresión comanda: datos del negocio no disponibles offline; usando encabezado mínimo.");
  }

  const paperWidthMm = getThermalPrintSettings().paperWidthMm;
  const tr = (tenantRow ?? {
    nombre_negocio: "Comanda de cocina",
    rnc: null,
    direccion: null,
    telefono: null,
    logo_url: null,
    moneda: "DOP",
  }) as {
    nombre_negocio: string | null;
    rnc: string | null;
    direccion: string | null;
    telefono: string | null;
    logo_url: string | null;
    moneda?: string | null;
    logo_size_px?: number;
    logo_offset_x?: number;
    logo_offset_y?: number;
  };
  const comandaHtml = buildComandaReceiptHtml(
    {
      nombre_negocio: tr.nombre_negocio,
      rnc: tr.rnc,
      direccion: tr.direccion,
      telefono: tr.telefono,
      logo_url: tr.logo_url,
      moneda: tr.moneda ?? null,
      logo_size_px: tr.logo_size_px,
      logo_offset_x: tr.logo_offset_x,
      logo_offset_y: tr.logo_offset_y,
    },
    {
      id: comanda.id,
      numero_comanda: (comanda as { numero_comanda?: number }).numero_comanda,
      mesa_numero: comanda.mesa_numero,
      items:
        (comanda.items as Array<{
          nombre: string;
          cantidad: number;
          precio?: number;
          categoria?: string;
          notas?: string;
        }>) || [],
      notas: (comanda.notas as string | null) || null,
      created_at: comanda.created_at,
    } as any,
    paperWidthMm
  );
  const printRes = await printThermalHtml(comandaHtml, { printType: "kitchen" });
  if (!printRes.ok) {
    const printError = printRes.error || "Windows no confirmó la impresión.";
    console.warn("Impresión comanda:", printError);
    if (typeof alert === "function") {
      alert(
        `La comanda fue guardada correctamente, pero no pudo imprimirse en la impresora de cocina.

${printError}

Revisá que esté encendida, conectada por cable y sin trabajos pausados.`
      );
    }
  }
}
