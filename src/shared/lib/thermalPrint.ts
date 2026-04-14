import { getThermalPrintSettings } from "./thermalStorage";

function openBrowserPrint(html: string): void {
  const w = window.open("", "_blank", "width=400,height=720");
  if (!w) {
    console.warn("thermalPrint: no se pudo abrir ventana de impresión");
    return;
  }
  w.document.open();
  w.document.write(
    html.replace(
      "</body>",
      `<script>window.onload=function(){window.print();setTimeout(function(){window.close()},600);}</script></body>`
    )
  );
  w.document.close();
}

export interface PrintThermalResult {
  ok: boolean;
  error?: string;
}

/**
 * Impresión térmica: **ruta principal** en escritorio es Electron (`preload` → proceso principal → impresora).
 * Si no hay `electronAPI` (p. ej. `vite` solo en el navegador para desarrollo), se usa un fallback con `window.print()`.
 */
export async function printThermalHtml(html: string): Promise<PrintThermalResult> {
  const settings = getThermalPrintSettings();
  const api = window.electronAPI;

  if (api?.printThermal) {
    try {
      const res = await api.printThermal({
        html,
        deviceName: settings.printerName || undefined,
        silent: Boolean(settings.printerName?.trim()),
        paperWidthMm: settings.paperWidthMm,
      });
      return res ?? { ok: false, error: "Sin respuesta del proceso principal" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  openBrowserPrint(html);
  return { ok: true };
}
