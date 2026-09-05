import type { DesktopCommand, DesktopRepositoryResult } from "../../src/shared/lib/desktopRepository";
import type { CatalogCommand, CatalogRepositoryResult } from "../../src/shared/lib/catalogContracts";
import type { OrdersCommand, OrdersRepositoryResult } from "../../src/shared/lib/ordersContracts";
import {
  PAYROLL_ADJUSTMENT_KINDS,
  PAYROLL_ADJUSTMENT_SCOPES,
  PAYROLL_FREQUENCIES,
  type PayrollCommand,
} from "../../src/shared/lib/payrollContracts";
import type { SalesFiscalCommand, SalesFiscalRepositoryResult } from "./salesFiscalRepository";
import type { CashPurchaseCommand, CashPurchaseRepositoryResult } from "./cashPurchaseRepository";
import type { ReceivablesCommand, ReceivablesRepositoryResult } from "./receivablesRepository";
import type { PayablesCommand, PayablesRepositoryResult } from "./payablesRepository";
import type { ExpenseCommand, ExpenseRepositoryResult } from "./expenseRepository";

export const TENANT_STORE_STATUS_CHANNEL = "tenant-store:status";
export const TENANT_STORE_IMPORT_CHANNEL = "tenant-store:import-indexeddb";
export const DESKTOP_REPOSITORY_EXECUTE_CHANNEL = "desktop-repository:execute";
export const CATALOG_REPOSITORY_EXECUTE_CHANNEL = "catalog-repository:execute";
export const ORDERS_REPOSITORY_EXECUTE_CHANNEL = "orders-repository:execute";
export const FISCAL_SALES_REPOSITORY_EXECUTE_CHANNEL = "sales-fiscal-repository:execute";
export const CASH_PURCHASE_REPOSITORY_EXECUTE_CHANNEL = "cash-purchase-repository:execute";
export const PAYROLL_REPOSITORY_EXECUTE_CHANNEL = "payroll-repository:execute";
export const PAYROLL_SYNC_ACCESS_TOKEN_CHANNEL = "payroll-sync:set-access-token";
export const RECEIVABLES_REPOSITORY_EXECUTE_CHANNEL = "receivables-repository:execute";
export const PAYABLES_REPOSITORY_EXECUTE_CHANNEL = "payables-repository:execute";
export const EXPENSE_REPOSITORY_EXECUTE_CHANNEL = "expense-repository:execute";
export const EXPENSES_LIST_CHANNEL = "expenses:list";
export const EXPENSE_CATEGORIES_LIST_CHANNEL = "expense-categories:list";
export const SAVED_ACCOUNTS_LIST_CHANNEL = "saved-accounts:list";
export const SAVED_ACCOUNTS_SAVE_CHANNEL = "saved-accounts:save";
export const SAVED_ACCOUNTS_CREDENTIAL_CHANNEL = "saved-accounts:credential";
export const SAVED_ACCOUNTS_DELETE_CHANNEL = "saved-accounts:delete";
export const DEVICE_SESSION_PREFERENCE_SAVE_CHANNEL = "device-session:save-preference";
export const DEVICE_SESSION_PREFERENCE_READ_CHANNEL = "device-session:read-preference";

export interface ReceivablesRepositoryIpcMain { handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void; removeHandler(channel: string): void; }
export interface PayablesRepositoryIpcMain { handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void; removeHandler(channel: string): void; }
export interface ExpenseRepositoryIpcMain { handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void; removeHandler(channel: string): void; }

export interface TenantStoreIpcMain {
  handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void;
  removeHandler(channel: string): void;
}

export interface DesktopRepositoryIpcMain {
  handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void;
  removeHandler(channel: string): void;
}

export interface CatalogRepositoryIpcMain {
  handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void;
  removeHandler(channel: string): void;
}
export interface OrdersRepositoryIpcMain {
  handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void;
  removeHandler(channel: string): void;
}
export interface SalesFiscalRepositoryIpcMain {
  handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void;
  removeHandler(channel: string): void;
}
export interface CashPurchaseRepositoryIpcMain { handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void; removeHandler(channel: string): void; }
export interface PayrollRepositoryIpcMain { handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void; removeHandler(channel: string): void; }

export interface PayrollAuthorizationContext {
  tenantId: string;
  allowedBranchIds: readonly string[];
}

export interface SavedAccountIpcMain { handle(channel: string, handler: (event: { senderId: number }, payload?: unknown) => unknown): void; removeHandler(channel: string): void; }

type SavedAccountDirectory = {
  listAccounts(): Array<{ id: string; email: string; hasPassword: boolean }>;
  saveAccount(input: { email: string; passwordCiphertext: Uint8Array | null }): { id: string; email: string; hasPassword: boolean };
  getPasswordCiphertext(id: string): Uint8Array | null;
  deleteAccount(id: string): void;
  saveSessionPreference(input: { tenantId: string; userId: string; allowedBranchIds: string[]; defaultBranchId: string | null }): { tenantId: string; userId: string; allowedBranchIds: string[]; defaultBranchId: string | null };
  readSessionPreference(tenantId: string, userId: string): { tenantId: string; userId: string; allowedBranchIds: string[]; defaultBranchId: string | null } | null;
};

export function registerSavedAccountIpc(input: {
  ipcMain: SavedAccountIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  getDirectory: () => SavedAccountDirectory;
  isEncryptionAvailable: () => boolean;
  encrypt: (password: string) => Uint8Array;
  decrypt: (ciphertext: Uint8Array) => string;
}): void {
  const trusted = (event: { senderId: number }) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  };
  input.ipcMain.removeHandler(SAVED_ACCOUNTS_LIST_CHANNEL);
  input.ipcMain.handle(SAVED_ACCOUNTS_LIST_CHANNEL, async (event) => {
    trusted(event);
    return { ok: true, data: { encryptionAvailable: input.isEncryptionAvailable(), accounts: input.getDirectory().listAccounts() } };
  });
  input.ipcMain.removeHandler(SAVED_ACCOUNTS_SAVE_CHANNEL);
  input.ipcMain.handle(SAVED_ACCOUNTS_SAVE_CHANNEL, async (event, payload) => {
    trusted(event);
    const account = parseSavedAccount(payload);
    if (!account) throw new Error("Invalid saved account payload");
    const ciphertext = account.password && input.isEncryptionAvailable() ? input.encrypt(account.password) : null;
    return { ok: true, data: input.getDirectory().saveAccount({ email: account.email, passwordCiphertext: ciphertext }) };
  });
  input.ipcMain.removeHandler(SAVED_ACCOUNTS_CREDENTIAL_CHANNEL);
  input.ipcMain.handle(SAVED_ACCOUNTS_CREDENTIAL_CHANNEL, async (event, payload) => {
    trusted(event);
    const id = parseId(payload);
    if (!id || !input.isEncryptionAvailable()) return { ok: true, data: null };
    const ciphertext = input.getDirectory().getPasswordCiphertext(id);
    return { ok: true, data: ciphertext ? { password: input.decrypt(ciphertext) } : null };
  });
  input.ipcMain.removeHandler(SAVED_ACCOUNTS_DELETE_CHANNEL);
  input.ipcMain.handle(SAVED_ACCOUNTS_DELETE_CHANNEL, async (event, payload) => {
    trusted(event);
    const id = parseId(payload);
    if (!id) throw new Error("Invalid saved account id");
    input.getDirectory().deleteAccount(id);
    return { ok: true };
  });
  input.ipcMain.removeHandler(DEVICE_SESSION_PREFERENCE_SAVE_CHANNEL);
  input.ipcMain.handle(DEVICE_SESSION_PREFERENCE_SAVE_CHANNEL, async (event, payload) => {
    trusted(event);
    const preference = parseSessionPreference(payload);
    if (!preference) throw new Error("Invalid device session preference");
    return { ok: true, data: input.getDirectory().saveSessionPreference(preference) };
  });
  input.ipcMain.removeHandler(DEVICE_SESSION_PREFERENCE_READ_CHANNEL);
  input.ipcMain.handle(DEVICE_SESSION_PREFERENCE_READ_CHANNEL, async (event, payload) => {
    trusted(event);
    const identity = parseSessionIdentity(payload);
    if (!identity) throw new Error("Invalid device session identity");
    return { ok: true, data: input.getDirectory().readSessionPreference(identity.tenantId, identity.userId) };
  });
}

export function registerReceivablesRepositoryIpc(input: { ipcMain: ReceivablesRepositoryIpcMain; isTrustedSender: (event: { senderId: number }) => boolean; getRepository: () => { execute(command: ReceivablesCommand): ReceivablesRepositoryResult } }): void {
  input.ipcMain.removeHandler(RECEIVABLES_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(RECEIVABLES_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseReceivablesCommand(payload);
    if (!command) throw new Error("Invalid receivables command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerPayablesRepositoryIpc(input: { ipcMain: PayablesRepositoryIpcMain; isTrustedSender: (event: { senderId: number }) => boolean; getRepository: () => { execute(command: PayablesCommand): PayablesRepositoryResult } }): void {
  input.ipcMain.removeHandler(PAYABLES_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(PAYABLES_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parsePayablesCommand(payload);
    if (!command) throw new Error("Invalid payables command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerExpenseRepositoryIpc(input: {
  ipcMain: ExpenseRepositoryIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  getRepository: () => { execute(command: ExpenseCommand): ExpenseRepositoryResult };
  listExpenses?: (filter?: { sucursalId?: string; limit?: number }) => Array<Record<string, unknown>>;
  listCategories?: () => Array<Record<string, unknown>>;
}): void {
  input.ipcMain.removeHandler(EXPENSE_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(EXPENSE_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseExpenseCommand(payload);
    if (!command) throw new Error("Invalid expense command");
    return { ok: true, data: input.getRepository().execute(command) };
  });

  input.ipcMain.removeHandler(EXPENSES_LIST_CHANNEL);
  input.ipcMain.handle(EXPENSES_LIST_CHANNEL, async (event, filter) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    return { ok: true, data: input.listExpenses?.(filter as any) ?? [] };
  });

  input.ipcMain.removeHandler(EXPENSE_CATEGORIES_LIST_CHANNEL);
  input.ipcMain.handle(EXPENSE_CATEGORIES_LIST_CHANNEL, async (event) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    return { ok: true, data: input.listCategories?.() ?? [] };
  });
}

export function registerPayrollRepositoryIpc(input: {
  ipcMain: PayrollRepositoryIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  getAuthorizationContext: (tenantId?: string) => PayrollAuthorizationContext | null;
  executeCommand: (command: PayrollCommand) => Promise<unknown>;
}): void {
  input.ipcMain.removeHandler(PAYROLL_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(PAYROLL_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parsePayrollCommand(payload);
    if (!command) throw new Error("Invalid payroll command");
    authorizePayrollCommand(input.getAuthorizationContext(command.tenantId), command);
    return { ok: true, data: await input.executeCommand(command) };
  });
}

function authorizePayrollCommand(context: PayrollAuthorizationContext | null, command: PayrollCommand): void {
  if (!context) throw new Error("Payroll authorization context is unavailable");
  if (command.tenantId !== context.tenantId) throw new Error("Payroll tenant mismatch");
  if (!context.allowedBranchIds.includes(command.sucursalId)) throw new Error("Payroll branch access denied");
}

export function registerPayrollSyncAccessTokenIpc(input: {
  ipcMain: PayrollRepositoryIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  setAccessToken: (accessToken: string | null) => Promise<void> | void;
}): void {
  input.ipcMain.removeHandler(PAYROLL_SYNC_ACCESS_TOKEN_CHANNEL);
  input.ipcMain.handle(PAYROLL_SYNC_ACCESS_TOKEN_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const accessToken = parsePayrollSyncAccessToken(payload);
    if (accessToken === undefined) throw new Error("Invalid payroll sync access token");
    await input.setAccessToken(accessToken);
    return { ok: true };
  });
}

export function registerCashPurchaseRepositoryIpc(input: { ipcMain: CashPurchaseRepositoryIpcMain; isTrustedSender: (event: { senderId: number }) => boolean; getRepository: () => { execute(command: CashPurchaseCommand): CashPurchaseRepositoryResult } }): void {
  input.ipcMain.removeHandler(CASH_PURCHASE_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(CASH_PURCHASE_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseCashPurchaseCommand(payload);
    if (!command) throw new Error("Invalid cash purchase command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerSalesFiscalRepositoryIpc(input: { ipcMain: SalesFiscalRepositoryIpcMain; isTrustedSender: (event: { senderId: number }) => boolean; getRepository: () => { execute(command: SalesFiscalCommand): SalesFiscalRepositoryResult } }): void {
  input.ipcMain.removeHandler(FISCAL_SALES_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(FISCAL_SALES_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseSalesFiscalCommand(payload);
    if (!command) throw new Error("Invalid sales fiscal command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerOrdersRepositoryIpc(input: { ipcMain: OrdersRepositoryIpcMain; isTrustedSender: (event: { senderId: number }) => boolean; getRepository: () => { execute(command: OrdersCommand): OrdersRepositoryResult } }): void {
  input.ipcMain.removeHandler(ORDERS_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(ORDERS_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseOrdersCommand(payload);
    if (!command) throw new Error("Invalid orders command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerCatalogRepositoryIpc(input: {
  ipcMain: CatalogRepositoryIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  getRepository: () => { execute(command: CatalogCommand): CatalogRepositoryResult };
}): void {
  input.ipcMain.removeHandler(CATALOG_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(CATALOG_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseCatalogCommand(payload);
    if (!command) throw new Error("Invalid catalog command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerDesktopRepositoryIpc(input: {
  ipcMain: DesktopRepositoryIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  getRepository: () => { execute(command: DesktopCommand): DesktopRepositoryResult };
}): void {
  input.ipcMain.removeHandler(DESKTOP_REPOSITORY_EXECUTE_CHANNEL);
  input.ipcMain.handle(DESKTOP_REPOSITORY_EXECUTE_CHANNEL, async (event, payload) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const command = parseDesktopCommand(payload);
    if (!command) throw new Error("Invalid desktop repository command");
    return { ok: true, data: input.getRepository().execute(command) };
  });
}

export function registerTenantStoreIpc(input: {
  ipcMain: TenantStoreIpcMain;
  isTrustedSender: (event: { senderId: number }) => boolean;
  getStatus: () => { tenantId: string | null; isOpen: boolean };
  getActiveTenantId?: () => string | null;
  importLegacySnapshot?: (payload: unknown) => Promise<unknown> | unknown;
}): void {
  input.ipcMain.removeHandler(TENANT_STORE_STATUS_CHANNEL);
  input.ipcMain.handle(TENANT_STORE_STATUS_CHANNEL, async (event) => {
    if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    const status = input.getStatus();
    return { ok: true, data: { isOpen: status.isOpen } };
  });

  if (input.getActiveTenantId && input.importLegacySnapshot) {
    input.ipcMain.removeHandler(TENANT_STORE_IMPORT_CHANNEL);
    input.ipcMain.handle(TENANT_STORE_IMPORT_CHANNEL, async (event, payload) => {
      if (!input.isTrustedSender(event)) throw new Error("Untrusted IPC sender");
      const activeTenantId = input.getActiveTenantId();
      const manifestTenantId = getManifestTenantId(payload);
      if (!activeTenantId || manifestTenantId !== activeTenantId) throw new Error("Legacy import tenant mismatch");
      return { ok: true, data: await input.importLegacySnapshot(payload) };
    });
  }
}

function getManifestTenantId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const manifest = (payload as { manifest?: unknown }).manifest;
  if (!manifest || typeof manifest !== "object") return null;
  const tenantId = (manifest as { tenantId?: unknown }).tenantId;
  return typeof tenantId === "string" ? tenantId : null;
}

function parseDesktopCommand(payload: unknown): DesktopCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  const keys = Object.keys(command);
  if (keys.length !== 3 || !keys.every((key) => key === "type" || key === "id" || key === "value")) return null;
  if (command.type !== "foundation.record.write" || typeof command.id !== "string" || typeof command.value !== "string") return null;
  if (command.id.length === 0 || command.id.length > 128 || command.value.length > 1_000_000) return null;
  return { type: command.type, id: command.id, value: command.value };
}

function parseCatalogCommand(payload: unknown): CatalogCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  const isString = (key: string) => typeof command[key] === "string" && (command[key] as string).length > 0 && (command[key] as string).length <= 256;
  const hasOnly = (...keys: string[]) => Object.keys(command).length === keys.length && Object.keys(command).every((key) => keys.includes(key));
  if (["catalog.branch.upsert", "catalog.customer.upsert", "catalog.supplier.upsert", "catalog.category.upsert"].includes(String(command.type)) && hasOnly("type", "id", "name") && isString("id") && isString("name")) return command as CatalogCommand;
  if (command.type === "catalog.product.upsert" && hasOnly("type", "id", "name", "categoryId") && isString("id") && isString("name") && isString("categoryId")) return command as CatalogCommand;
  if (command.type === "catalog.inventory-product.upsert" && hasOnly("type", "id", "name", "unit") && isString("id") && isString("name") && isString("unit")) return command as CatalogCommand;
  if (command.type === "catalog.recipe.upsert" && hasOnly("type", "id", "platoId", "inventoryProductId", "quantity") && isString("id") && isString("platoId") && isString("inventoryProductId") && typeof command.quantity === "number" && Number.isFinite(command.quantity) && command.quantity > 0) return command as CatalogCommand;
  return null;
}

function parseOrdersCommand(payload: unknown): OrdersCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  const text = (key: string) => typeof command[key] === "string" && command[key].length > 0 && command[key].length <= 256;
  const only = (...keys: string[]) => Object.keys(command).length === keys.length && Object.keys(command).every((key) => keys.includes(key));
  const money = (key: string) => typeof command[key] === "number" && Number.isFinite(command[key]) && command[key] >= 0;
  if (command.type === "orders.table.set-state" && only("type", "tableId", "tableNumber", "state") && text("tableId") && Number.isInteger(command.tableNumber) && (command.tableNumber as number) > 0 && ["free", "occupied"].includes(String(command.state))) return command as OrdersCommand;
  if (command.type === "orders.kitchen.set-open" && only("type", "id", "isOpen") && text("id") && typeof command.isOpen === "boolean") return command as OrdersCommand;
  if (command.type === "orders.kitchen.advance" && only("type", "orderId", "nextState") && text("orderId") && ["preparing", "ready", "delivered"].includes(String(command.nextState))) return command as OrdersCommand;
  if (command.type === "orders.cycle.open" && only("type", "id", "businessDay", "openingCash") && text("id") && /^\d{4}-\d{2}-\d{2}$/.test(String(command.businessDay)) && money("openingCash")) return command as OrdersCommand;
  if (command.type === "orders.cycle.close" && only("type", "id") && text("id")) return command as OrdersCommand;
  if (command.type !== "orders.order-to-kitchen" || !only("type", "orderId", "tableId", "tableNumber", "items") || !text("orderId") || !text("tableId") || !Number.isInteger(command.tableNumber) || (command.tableNumber as number) < 1 || !Array.isArray(command.items) || command.items.length === 0 || command.items.length > 100) return null;
  return command.items.every((item) => item && typeof item === "object" && Object.keys(item as object).length === 5 && ["id", "productId", "name"].every((key) => typeof (item as Record<string, unknown>)[key] === "string" && ((item as Record<string, string>)[key]).length > 0) && Number.isInteger((item as Record<string, unknown>).quantity) && Number((item as Record<string, unknown>).quantity) > 0 && typeof (item as Record<string, unknown>).unitPrice === "number" && Number.isFinite((item as Record<string, number>).unitPrice) && (item as Record<string, number>).unitPrice >= 0) ? command as OrdersCommand : null;
}

function parseSalesFiscalCommand(payload: unknown): SalesFiscalCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  const keys = ["type", "invoiceId", "fiscalIntentId", "fiscalMode", "documentType", "total"];
  const text = (key: string) => typeof command[key] === "string" && command[key].length > 0 && command[key].length <= 256;
  if (Object.keys(command).length !== keys.length || !Object.keys(command).every((key) => keys.includes(key))) return null;
  if (command.type !== "sales.fiscal.create" || !text("invoiceId") || !text("fiscalIntentId") || !text("documentType") || !["internal_receipt", "ncf_legacy", "dgii_ecf"].includes(String(command.fiscalMode)) || typeof command.total !== "number" || !Number.isFinite(command.total) || command.total < 0) return null;
  return command as SalesFiscalCommand;
}

function parseCashPurchaseCommand(payload: unknown): CashPurchaseCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>, keys = ["type", "purchaseId", "supplierId", "detailId", "inventoryMovementId", "expenseId", "inventoryProductId", "quantity", "unitCost"];
  const text = (key: string) => typeof command[key] === "string" && command[key].length > 0 && command[key].length <= 256;
  if (Object.keys(command).length !== keys.length || !Object.keys(command).every((key) => keys.includes(key)) || command.type !== "purchase.cash.create" || !keys.slice(1, 7).every(text)) return null;
  return typeof command.quantity === "number" && Number.isFinite(command.quantity) && command.quantity > 0 && typeof command.unitCost === "number" && Number.isFinite(command.unitCost) && command.unitCost >= 0 ? command as CashPurchaseCommand : null;
}

function parseReceivablesCommand(payload: unknown): ReceivablesCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  const text = (key: string) => typeof command[key] === "string" && (command[key] as string).trim().length > 0 && (command[key] as string).length <= 256;
  if (command.type === "receivables.create") {
    if (!text("id") || !text("customerId")) return null;
    if (typeof command.totalAmount !== "number" || !Number.isFinite(command.totalAmount) || command.totalAmount < 0) return null;
    return command as ReceivablesCommand;
  }
  if (command.type === "receivables.payment.record") {
    if (!text("paymentId") || !text("receivableId") || !text("paymentMethod")) return null;
    if (typeof command.amount !== "number" || !Number.isFinite(command.amount) || command.amount <= 0) return null;
    return command as ReceivablesCommand;
  }
  return null;
}

function parsePayablesCommand(payload: unknown): PayablesCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  const text = (key: string) => typeof command[key] === "string" && (command[key] as string).trim().length > 0 && (command[key] as string).length <= 256;
  if (command.type === "payables.create") {
    if (!text("id") || !text("supplierId")) return null;
    if (typeof command.totalAmount !== "number" || !Number.isFinite(command.totalAmount) || command.totalAmount < 0) return null;
    return command as PayablesCommand;
  }
  if (command.type === "payables.payment.record") {
    if (!text("paymentId") || !text("payableId") || !text("paymentMethod")) return null;
    if (typeof command.amount !== "number" || !Number.isFinite(command.amount) || command.amount <= 0) return null;
    return command as PayablesCommand;
  }
  return null;
}

function parseExpenseCommand(payload: unknown): ExpenseCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const text = (val: unknown) => typeof val === "string" && val.trim().length > 0 && val.length <= 512;

  if (p.type === "expense.create") {
    if (!text(p.id) || !text(p.description)) return null;
    if (typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0) return null;
    return {
      type: "expense.create",
      id: String(p.id).trim(),
      categoryId: typeof p.categoryId === "string" && p.categoryId.trim() ? p.categoryId.trim() : null,
      cycleId: typeof p.cycleId === "string" && p.cycleId.trim() ? p.cycleId.trim() : null,
      description: String(p.description).trim(),
      supplier: typeof p.supplier === "string" && p.supplier.trim() ? p.supplier.trim() : null,
      amount: p.amount,
      paymentMethod: typeof p.paymentMethod === "string" && p.paymentMethod.trim() ? p.paymentMethod.trim() : "cash",
      expenseDate: typeof p.expenseDate === "string" && p.expenseDate.trim() ? p.expenseDate.trim() : undefined,
      notes: typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : null,
    };
  }

  if (p.type === "expense.delete") {
    if (!text(p.id)) return null;
    return { type: "expense.delete", id: String(p.id).trim() };
  }

  if (p.type === "expense.category.create") {
    if (!text(p.id) || !text(p.name)) return null;
    return {
      type: "expense.category.create",
      id: String(p.id).trim(),
      name: String(p.name).trim(),
      description: typeof p.description === "string" && p.description.trim() ? p.description.trim() : null,
      color: typeof p.color === "string" && p.color.trim() ? p.color.trim() : "#ff906d",
    };
  }

  if (p.type === "expense.category.delete") {
    if (!text(p.id)) return null;
    return { type: "expense.category.delete", id: String(p.id).trim() };
  }

  return null;
}

function parsePayrollCommand(payload: unknown): PayrollCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const command = payload as Record<string, unknown>;
  if (!isNonEmptyText(command.tenantId) || !isNonEmptyText(command.sucursalId) || !isNonEmptyText(command.type)) return null;

  if (command.type === "payroll.getEmployees") {
    return command as PayrollCommand;
  }

  if (command.type === "payroll.getPayments") {
    return isExactObject(payload, ["type", "tenantId", "sucursalId", "employeeId"])
      ? (command as PayrollCommand)
      : null;
  }

  if (command.type === "payroll.disableEmployee") {
    return isExactObject(payload, ["type", "tenantId", "sucursalId", "employeeId"]) && isNonEmptyText(command.employeeId)
      ? (command as PayrollCommand)
      : null;
  }

  if (command.type === "payroll.upsertEmployee") {
    if (!isExactObject(payload, ["type", "tenantId", "sucursalId", "employee"])) return null;
    return isValidPayrollEmployee(command.employee) ? (command as PayrollCommand) : null;
  }

  if (command.type === "payroll.getPaymentContext") {
    if (!isExactObject(payload, ["type", "tenantId", "sucursalId", "payload"])) return null;
    return isValidPaymentContextPayload(command.payload, false) ? (command as PayrollCommand) : null;
  }

  if (command.type === "payroll.createPayment") {
    if (!isExactObject(payload, ["type", "tenantId", "sucursalId", "payload"])) return null;
    return isValidPaymentContextPayload(command.payload, true) ? (command as PayrollCommand) : null;
  }

  return null;
}

function parseSavedAccount(payload: unknown): { email: string; password: string | null } | null {
  if (!isExactObject(payload, ["email", "password"], false)) return null;
  const { email, password } = payload as Record<string, unknown>;
  if (typeof email !== "string" || email.trim().length === 0 || email.length > 320) return null;
  if (password !== null && (typeof password !== "string" || password.length === 0 || password.length > 1024)) return null;
  return { email, password };
}

function parseId(payload: unknown): string | null {
  return isExactObject(payload, ["id"], false) && isNonEmptyText((payload as Record<string, unknown>).id)
    ? (payload as { id: string }).id
    : null;
}

function parseSessionIdentity(payload: unknown): { tenantId: string; userId: string } | null {
  if (!isExactObject(payload, ["tenantId", "userId"], false)) return null;
  const record = payload as Record<string, unknown>;
  return isNonEmptyText(record.tenantId) && isNonEmptyText(record.userId)
    ? { tenantId: record.tenantId, userId: record.userId }
    : null;
}

function parseSessionPreference(payload: unknown): { tenantId: string; userId: string; allowedBranchIds: string[]; defaultBranchId: string | null } | null {
  if (!isExactObject(payload, ["tenantId", "userId", "allowedBranchIds", "defaultBranchId"], false)) return null;
  const record = payload as Record<string, unknown>;
  if (!isNonEmptyText(record.tenantId) || !isNonEmptyText(record.userId) || !Array.isArray(record.allowedBranchIds) || record.allowedBranchIds.length > 100) return null;
  if (!record.allowedBranchIds.every(isNonEmptyText) || (record.defaultBranchId !== null && !isNonEmptyText(record.defaultBranchId))) return null;
  return { tenantId: record.tenantId, userId: record.userId, allowedBranchIds: record.allowedBranchIds, defaultBranchId: record.defaultBranchId as string | null };
}

function parsePayrollSyncAccessToken(payload: unknown): string | null | undefined {
  if (payload === null) return null;
  if (!isExactObject(payload, ["accessToken"], false)) return undefined;
  const accessToken = (payload as Record<string, unknown>).accessToken;
  if (typeof accessToken !== "string" || accessToken.length > 8192) return undefined;

  const parts = accessToken.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown; sub?: unknown };
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return accessToken;
}

function isValidPayrollEmployee(value: unknown): boolean {
  if (!isExactObject(value, ["id", "firstName", "lastName", "role", "baseSalaryCents", "frequency", "isActive"])) return false;
  const employee = value as Record<string, unknown>;
  return (
    (employee.id === undefined || isNonEmptyText(employee.id)) &&
    isNonEmptyText(employee.firstName) &&
    isNonEmptyText(employee.lastName) &&
    isNonEmptyText(employee.role) &&
    isCents(employee.baseSalaryCents) &&
    isPayrollFrequency(employee.frequency) &&
    typeof employee.isActive === "boolean"
  );
}

function isValidPaymentContextPayload(value: unknown, requirePaymentAmount: boolean): boolean {
  const keys = requirePaymentAmount
    ? ["employeeId", "period", "frequency", "paymentAmountCents", "receiptSnapshot", "adjustments"]
    : ["employeeId", "period", "frequency", "adjustments"];

  if (!isExactObject(value, keys)) return false;
  const payload = value as Record<string, unknown>;

  return (
    isNonEmptyText(payload.employeeId) &&
    isValidPayrollPeriod(payload.period, payload.frequency) &&
    isPayrollFrequency(payload.frequency) &&
    (!requirePaymentAmount || isCents(payload.paymentAmountCents)) &&
    (!requirePaymentAmount || typeof payload.receiptSnapshot === "string") &&
    Array.isArray(payload.adjustments) &&
    payload.adjustments.every(isValidAdjustment)
  );
}

function isValidAdjustment(value: unknown): boolean {
  if (!isExactObject(value, ["kind", "type", "scope", "amountCents", "note"])) return false;
  const adjustment = value as Record<string, unknown>;
  if (!PAYROLL_ADJUSTMENT_KINDS.includes(adjustment.kind as (typeof PAYROLL_ADJUSTMENT_KINDS)[number])) return false;
  if (!PAYROLL_ADJUSTMENT_SCOPES.includes(adjustment.scope as (typeof PAYROLL_ADJUSTMENT_SCOPES)[number])) return false;
  if (!isNonEmptyText(adjustment.type) || !isCents(adjustment.amountCents) || typeof adjustment.note !== "string") return false;
  if (adjustment.kind === "discount" && adjustment.note.trim().length === 0) return false;
  return true;
}

function isExactObject(value: unknown, keys: string[], allowUndefinedKeys = true): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const valueKeys = Object.keys(record);
  if (!valueKeys.every((key) => keys.includes(key))) return false;
  if (!allowUndefinedKeys && !keys.every((key) => key in record)) return false;
  for (const key of valueKeys) {
    const nestedValue = record[key];
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue) && key !== "employee" && key !== "payload") {
      return false;
    }
  }
  return true;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPayrollFrequency(value: unknown): boolean {
  return PAYROLL_FREQUENCIES.includes(value as (typeof PAYROLL_FREQUENCIES)[number]);
}

function isValidPayrollPeriod(period: unknown, frequency: unknown): boolean {
  if (typeof period !== "string" || !isPayrollFrequency(frequency)) return false;
  if (frequency === "monthly") return /^\d{4}-\d{2}$/.test(period);
  if (frequency === "biweekly") return /^\d{4}-\d{2}-(1|2)$/.test(period);
  return /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/.test(period);
}
