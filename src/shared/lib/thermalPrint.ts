import { getThermalPrintSettings } from "./thermalStorage";

function openBrowserPrint(html: string): void {
  const isMobile = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
  const w = window.open("", "_blank", "width=420,height=760");
  if (!w) {
    console.warn("thermalPrint: no se pudo abrir ventana de impresi?n");
    return;
  }

  const printControls = `
    <style>
      .web-print-controls {
        position: sticky;
        top: 0;
        z-index: 999999;
        display: flex;
        gap: 8px;
        justify-content: center;
        padding: 10px;
        background: #111;
        border-bottom: 1px solid #333;
      }
      .web-print-controls button {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font: 700 12px system-ui, sans-serif;
        text-transform: uppercase;
        background: #ff906d;
        color: #120400;
      }
      @media print { .web-print-controls { display: none !important; } }
    </style>
    <div class="web-print-controls">
      <button type="button" onclick="window.print()">Imprimir factura</button>
      <button type="button" onclick="window.close()">Cerrar</button>
    </div>
  `;

  w.document.open();
  w.document.write(
    html
      .replace(/<body([^>]*)>/i, `<body$1>${printControls}`)
      .replace(
        "</body>",
        `<script>
          window.onload = function(){
            setTimeout(function(){ window.print(); }, ${isMobile ? 900 : 300});
            ${isMobile ? "" : "setTimeout(function(){ window.close(); }, 1500);"}
          };
        </script></body>`
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
 * Siempre abre el diálogo de impresión del sistema (no silencioso).
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
        silent: false,
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
