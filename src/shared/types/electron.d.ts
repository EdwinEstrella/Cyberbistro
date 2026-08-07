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

export interface OpenCashDrawerOptions {
  deviceName?: string;
  paperWidthMm?: number;
}

export interface RncLookupResponse {
  data: {
    rnc: string;
    legalName: string;
    tradeName: string;
    status: string;
  } | null;
  error: string | null;
}

export interface EcfCertificateValidationResponse {
  data: {
    subject: string;
    issuer: string;
    serialNumber: string;
    validFrom: string;
    validUntil: string;
  } | null;
  error: string | null;
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
  ensureInputFocus?: () => Promise<boolean>;
  close: () => void;
  getVersions: () => NodeJS.ProcessVersions;
  onWindowMaximized?: (callback: (isMaximized: boolean) => void) => void;
  listPrinters?: () => Promise<ThermalPrinterInfo[]>;
  printThermal?: (opts: PrintThermalOptions) => Promise<PrintThermalResponse>;
  openCashDrawer?: (opts?: OpenCashDrawerOptions) => Promise<PrintThermalResponse>;
  lookupBusinessRnc?: (rnc: string) => Promise<RncLookupResponse>;
  openCertificationPortal?: () => Promise<void>;
  validateEcfCertificate?: (payload: {
    tenantId: string;
    environment: string;
    certificateBase64: string;
    passphrase: string;
  }) => Promise<EcfCertificateValidationResponse>;
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
