import type { DesktopCommand, DesktopRepositoryResult } from "../../src/shared/lib/desktopRepository";
import type { CatalogCommand, CatalogRepositoryResult } from "../../src/shared/lib/catalogContracts";
import type { OrdersCommand, OrdersRepositoryResult } from "../../src/shared/lib/ordersContracts";
import type { SalesFiscalCommand, SalesFiscalRepositoryResult } from "./salesFiscalRepository";
import type { CashPurchaseCommand, CashPurchaseRepositoryResult } from "./cashPurchaseRepository";

export const TENANT_STORE_STATUS_CHANNEL = "tenant-store:status";
export const TENANT_STORE_IMPORT_CHANNEL = "tenant-store:import-indexeddb";
export const DESKTOP_REPOSITORY_EXECUTE_CHANNEL = "desktop-repository:execute";
export const CATALOG_REPOSITORY_EXECUTE_CHANNEL = "catalog-repository:execute";
export const ORDERS_REPOSITORY_EXECUTE_CHANNEL = "orders-repository:execute";
export const FISCAL_SALES_REPOSITORY_EXECUTE_CHANNEL = "sales-fiscal-repository:execute";
export const CASH_PURCHASE_REPOSITORY_EXECUTE_CHANNEL = "cash-purchase-repository:execute";

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
