import { getThermalPrintSettings } from "./thermalStorage";
import { invalidatePrinterValidation, observePrinterValidation } from "./printerValidationCache";
import { toast } from "sonner";

const queuedPrintIds = new Set<string>();
let thermalPrintQueue = Promise.resolve();

export function enqueueThermalPrint(args: {
  id: string;
  label: string;
  print: () => Promise<PrintThermalResult>;
}): boolean {
  if (queuedPrintIds.has(args.id)) return false;
  queuedPrintIds.add(args.id);
  thermalPrintQueue = thermalPrintQueue.then(async () => {
    try {
      const result = await args.print();
      if (!result.ok) {
        toast.error(`${args.label} fue guardado, pero no se pudo imprimir.`, {
          description: `${result.error || "Error de impresión"} Reimprimí usando el ID ${args.id}.`,
          duration: Infinity,
        });
      }
    } catch (error) {
      toast.error(`${args.label} fue guardado, pero no se pudo imprimir.`, {
        description: `${error instanceof Error ? error.message : String(error)} Reimprimí usando el ID ${args.id}.`,
        duration: Infinity,
      });
    } finally {
      queuedPrintIds.delete(args.id);
    }
  });
  return true;
}

/**
 * Web fallback: render the receipt into a hidden same-origin iframe and print it.
 *
 * `window.open()` cannot be used here: receipts print from the queued microtask in
 * `enqueueThermalPrint` — after the checkout await chain — so the user gesture is
 * already gone and the browser blocks the popup, printing nothing and surfacing no
 * error. An iframe needs no popup permission and still opens the system print
 * dialog, so the cashier can pick the printer as before.
 */
function openBrowserPrint(html: string): void {
  const isMobile = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = "420px";
  iframe.style.height = "600px";
  iframe.style.border = "none";
  iframe.style.opacity = "0";

  let cleaned = false;
  let printed = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {}
    }, 1000);
  };

  iframe.onload = () => {
    if (printed) return;
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    printed = true;
    iframe.onload = null;

    // Give images (logo) a beat to paint before printing.
    setTimeout(() => {
      try {
        win.focus();
        win.addEventListener("afterprint", cleanup, { once: true });
        win.print();
        setTimeout(cleanup, 60000);
      } catch (err) {
        console.warn("thermalPrint: fallo al imprimir en el navegador", err);
        cleanup();
      }
    }, isMobile ? 500 : 150);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export interface PrintThermalResult {
  ok: boolean;
  error?: string;
}

/**
 * Impresión térmica: **ruta principal** en escritorio es Electron (`preload` → proceso principal → impresora).
 * Siempre abre el diálogo de impresión del sistema (no silencioso).
 * Si no hay `electronAPI` (p. ej. `vite` solo en el navegador para desarrollo), se usa un fallback con `window.print()`.
 */
export async function printThermalHtml(
  html: string,
  options?: { silent?: boolean; printType?: "kitchen" | "sales" | "general" }
): Promise<PrintThermalResult> {
  const settings = getThermalPrintSettings();
  const api = window.electronAPI;
  
  let targetPrinter = settings.printerName;
  if (options?.printType === "kitchen" && settings.kitchenPrinterName) {
    targetPrinter = settings.kitchenPrinterName;
  } else if (options?.printType === "sales" && settings.salesPrinterName) {
    targetPrinter = settings.salesPrinterName;
  }

  const shouldBeSilent = options?.silent ?? Boolean(targetPrinter);

  // Windows printer enumeration can be slow. A fresh cached result can stop an
  // invalid silent job, but a refresh never delays payment or receipt printing.
  if (api?.printThermal && targetPrinter && api.listPrinters) {
    const targetExists = observePrinterValidation(targetPrinter, api.listPrinters);
    if (targetExists === false) {
      return {
        ok: false,
        error: `La impresora "${targetPrinter}" no está disponible en Windows. Volvé a seleccionarla en Cloudix.`,
      };
    }
  }

  if (api?.printThermal) {
    try {
      const res = await api.printThermal({
        html,
        deviceName: targetPrinter || undefined,
        silent: shouldBeSilent,
        paperWidthMm: settings.paperWidthMm,
      });
      const result = res ?? { ok: false, error: "Sin respuesta del proceso principal" };
      if (!result.ok && targetPrinter && api.listPrinters) {
        invalidatePrinterValidation();
        observePrinterValidation(targetPrinter, api.listPrinters);
      }
      return result;
    } catch (e) {
      if (targetPrinter && api.listPrinters) {
        invalidatePrinterValidation();
        observePrinterValidation(targetPrinter, api.listPrinters);
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  openBrowserPrint(html);
  return { ok: true };
}

export async function openCashDrawerForSale(): Promise<PrintThermalResult> {
  const settings = getThermalPrintSettings();
  const api = window.electronAPI;

  if (!api?.openCashDrawer) {
    return { ok: false, error: "La apertura de caja solo está disponible en la app de escritorio." };
  }

  let targetPrinter = settings.salesPrinterName || settings.printerName;

  try {
    const res = await api.openCashDrawer({
      deviceName: targetPrinter || undefined,
      paperWidthMm: settings.paperWidthMm,
    });
    return res ?? { ok: false, error: "Sin respuesta del proceso principal" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
