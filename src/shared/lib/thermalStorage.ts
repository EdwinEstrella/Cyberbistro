const STORAGE_KEY = "cloudix_thermal_print_v1";

export type PaperWidthMm = 80 | 88;

export interface ThermalPrintSettings {
  paperWidthMm: PaperWidthMm;
  /** Nombre exacto de impresora en el sistema (Electron). Vacío = diálogo de impresión o predeterminada. */
  printerName: string;
  logoSizePx: number;
  logoOffsetX: number;
  logoOffsetY: number;
}

const defaultSettings: ThermalPrintSettings = {
  paperWidthMm: 80,
  printerName: "",
  logoSizePx: 52,
  logoOffsetX: 0,
  logoOffsetY: 0,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function getThermalPrintSettings(): ThermalPrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const p = JSON.parse(raw) as Partial<ThermalPrintSettings>;
    return {
      paperWidthMm: p.paperWidthMm === 88 ? 88 : 80,
      printerName: typeof p.printerName === "string" ? p.printerName : "",
      logoSizePx: clampNumber(p.logoSizePx, 32, 90, defaultSettings.logoSizePx),
      logoOffsetX: clampNumber(p.logoOffsetX, -28, 28, defaultSettings.logoOffsetX),
      logoOffsetY: clampNumber(p.logoOffsetY, -12, 18, defaultSettings.logoOffsetY),
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
      logoSizePx: clampNumber(s.logoSizePx, 32, 90, defaultSettings.logoSizePx),
      logoOffsetX: clampNumber(s.logoOffsetX, -28, 28, defaultSettings.logoOffsetX),
      logoOffsetY: clampNumber(s.logoOffsetY, -12, 18, defaultSettings.logoOffsetY),
    })
  );
}
