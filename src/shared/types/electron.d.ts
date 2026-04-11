export interface ThermalPrinterInfo {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
}

export interface PrintThermalOptions {
  html: string;
  deviceName?: string;
  silent?: boolean;
  paperWidthMm?: number;
}

export interface PrintThermalResponse {
  ok: boolean;
  error?: string;
}

export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  getVersions: () => NodeJS.ProcessVersions;
  onWindowMaximized?: (callback: (isMaximized: boolean) => void) => void;
  listPrinters?: () => Promise<ThermalPrinterInfo[]>;
  printThermal?: (opts: PrintThermalOptions) => Promise<PrintThermalResponse>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
