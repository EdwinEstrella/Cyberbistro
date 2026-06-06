const STORAGE_KEY = "cloudix_thermal_print_v1";

export type PaperWidthMm = 80 | 58;

export interface ThermalPrintSettings {
  paperWidthMm: PaperWidthMm;
  /** Nombre exacto de impresora en el sistema (Electron). Vacío = diálogo de impresión o predeterminada. */
  printerName: string;
  printComandas: boolean;
}

const defaultSettings: ThermalPrintSettings = {
  paperWidthMm: 80,
  printerName: "",
  printComandas: true,
};

export function getThermalPrintSettings(): ThermalPrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const p = JSON.parse(raw) as Partial<ThermalPrintSettings>;
    return {
      paperWidthMm: p.paperWidthMm === 58 ? 58 : 80,
      printerName: typeof p.printerName === "string" ? p.printerName : "",
      printComandas: p.printComandas !== false,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveThermalPrintSettings(s: ThermalPrintSettings): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      paperWidthMm: s.paperWidthMm === 58 ? 58 : 80,
      printerName: s.printerName.trim(),
      printComandas: s.printComandas !== false,
    })
  );
}
