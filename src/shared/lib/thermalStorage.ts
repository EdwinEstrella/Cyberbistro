const STORAGE_KEY = "cloudix_thermal_print_v1";

export type PaperWidthMm = 80 | 88;

export interface ThermalPrintSettings {
  paperWidthMm: PaperWidthMm;
  /** Nombre exacto de impresora en el sistema (Electron). Vacío = diálogo de impresión o predeterminada. */
  printerName: string;
}

const defaultSettings: ThermalPrintSettings = {
  paperWidthMm: 80,
  printerName: "",
};

export function getThermalPrintSettings(): ThermalPrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const p = JSON.parse(raw) as Partial<ThermalPrintSettings>;
    return {
      paperWidthMm: p.paperWidthMm === 88 ? 88 : 80,
      printerName: typeof p.printerName === "string" ? p.printerName : "",
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveThermalPrintSettings(s: ThermalPrintSettings): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      paperWidthMm: s.paperWidthMm === 88 ? 88 : 80,
      printerName: s.printerName.trim(),
    })
  );
}
