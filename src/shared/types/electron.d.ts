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
  getTenantStoreStatus?: () => Promise<{ ok: true; data: { isOpen: boolean } }>;
  listSavedAccounts?: () => Promise<{ ok: true; data: { encryptionAvailable: boolean; accounts: Array<{ id: string; email: string; hasPassword: boolean }> } }>;
  saveSavedAccount?: (account: { email: string; password: string | null }) => Promise<{ ok: true; data: { id: string; email: string; hasPassword: boolean } }>;
  getSavedAccountCredential?: (id: string) => Promise<{ ok: true; data: { password: string } | null }>;
  deleteSavedAccount?: (id: string) => Promise<{ ok: true }>;
  saveDeviceSessionPreference?: (preference: { tenantId: string; userId: string; allowedBranchIds: string[]; defaultBranchId: string | null }) => Promise<{ ok: true; data: { defaultBranchId: string | null } }>;
  getDeviceSessionPreference?: (identity: { tenantId: string; userId: string }) => Promise<{ ok: true; data: { allowedBranchIds: string[]; defaultBranchId: string | null } | null }>;
  executeCatalogCommand?: (command: import("../lib/catalogContracts").CatalogCommand) => Promise<{ ok: true; data: import("../lib/catalogContracts").CatalogRepositoryResult }>;
  executeOrdersCommand?: (command: import("../lib/ordersContracts").OrdersCommand) => Promise<{ ok: true; data: import("../lib/ordersContracts").OrdersRepositoryResult }>;
  executeSalesFiscalCommand?: (command: import("../../../electron/persistence/salesFiscalRepository").SalesFiscalCommand) => Promise<{ ok: true; data: import("../../../electron/persistence/salesFiscalRepository").SalesFiscalRepositoryResult }>;
  executeCashPurchaseCommand?: (command: import("../../../electron/persistence/cashPurchaseRepository").CashPurchaseCommand) => Promise<{ ok: true; data: import("../../../electron/persistence/cashPurchaseRepository").CashPurchaseRepositoryResult }>;
  executePayrollCommand?: (command: import("../lib/payrollContracts").PayrollCommand) => Promise<{ ok: true; data: import("../lib/payrollContracts").PayrollRepositoryResult }>;
  setPayrollSyncAccessToken?: (accessToken: string | null) => Promise<{ ok: true }>;
  executeReceivablesCommand?: (command: import("../../../electron/persistence/receivablesRepository").ReceivablesCommand) => Promise<{ ok: true; data: import("../../../electron/persistence/receivablesRepository").ReceivablesRepositoryResult }>;
  executePayablesCommand?: (command: import("../../../electron/persistence/payablesRepository").PayablesCommand) => Promise<{ ok: true; data: import("../../../electron/persistence/payablesRepository").PayablesRepositoryResult }>;
  executeExpenseCommand?: (command: import("../../../electron/persistence/expenseRepository").ExpenseCommand) => Promise<{ ok: true; data: import("../../../electron/persistence/expenseRepository").ExpenseRepositoryResult }>;
  listExpenses?: (filter?: { sucursalId?: string; limit?: number }) => Promise<{ ok: true; data: Array<Record<string, unknown>> }>;
  listExpenseCategories?: () => Promise<{ ok: true; data: Array<Record<string, unknown>> }>;
  importLegacyIndexedDb?: (payload: unknown) => Promise<{ ok: true; data: { tenantId: string; importedRows: number; recoveredOutbox: number } }>;
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
