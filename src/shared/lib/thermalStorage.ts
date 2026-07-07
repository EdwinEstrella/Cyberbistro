const STORAGE_KEY = "cloudix_thermal_print_v1";

export type PaperWidthMm = 80 | 58;

export interface ThermalPrintSettings {
  paperWidthMm: PaperWidthMm;
  /** Nombre exacto de impresora en el sistema (Electron). Vacío = diálogo de impresión o predeterminada. */
  printerName: string;
  kitchenPrinterName?: string;
  salesPrinterName?: string;
  printComandas: boolean;
}

const defaultSettings: ThermalPrintSettings = {
  paperWidthMm: 80,
  printerName: "",
  kitchenPrinterName: "",
  salesPrinterName: "",
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
      kitchenPrinterName: typeof p.kitchenPrinterName === "string" ? p.kitchenPrinterName : "",
      salesPrinterName: typeof p.salesPrinterName === "string" ? p.salesPrinterName : "",
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
      kitchenPrinterName: s.kitchenPrinterName?.trim() || "",
      salesPrinterName: s.salesPrinterName?.trim() || "",
      printComandas: s.printComandas !== false,
    })
  );
}
