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
 * Imprime HTML térmico: en Electron usa IPC + impresora del sistema; en navegador, ventana + print().
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
