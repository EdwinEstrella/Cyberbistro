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
  onChecking?: () => void;
  onUpdateAvailable?: (info: UpdateInfoPayload) => void;
  onUpdateNotAvailable?: () => void;
  onDownloadProgress?: (progress: DownloadProgressPayload) => void;
  onUpdateDownloaded?: (info: UpdateInfoPayload) => void;
  onUpdateError?: (payload: unknown) => void;
}

export interface UpdateStatePayload {
  phase: "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "unsupported";
  remoteVersion: string | null;
  downloadedVersion: string | null;
  percent: number;
  error: string;
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
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  getUpdateState?: () => Promise<UpdateStatePayload>;
  onUpdateEvents?: (handlers: UpdateEventHandlers) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
