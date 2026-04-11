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

export interface UpdateInfoPayload {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | null;
}

export interface DownloadProgressPayload {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateEventHandlers {
  onUpdateAvailable?: (info: UpdateInfoPayload) => void;
  onUpdateNotAvailable?: () => void;
  onDownloadProgress?: (progress: DownloadProgressPayload) => void;
  onUpdateDownloaded?: (info: UpdateInfoPayload) => void;
  onUpdateError?: (message: string) => void;
}

export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  getVersions: () => NodeJS.ProcessVersions;
  onWindowMaximized?: (callback: (isMaximized: boolean) => void) => void;
  listPrinters?: () => Promise<ThermalPrinterInfo[]>;
  printThermal?: (opts: PrintThermalOptions) => Promise<PrintThermalResponse>;
  checkForUpdates?: () => void;
  installUpdate?: () => void;
  onUpdateEvents?: (handlers: UpdateEventHandlers) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
