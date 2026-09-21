import type { LocalFirstWrite } from "./localFirst";

export type DesktopCheckoutWrite = Pick<
  LocalFirstWrite,
  "tenantId" | "tableName" | "rowId" | "op" | "payload" | "authUserId" | "deviceId"
>;

export interface DesktopCheckoutCommand {
  tenantId: string;
  writes: DesktopCheckoutWrite[];
}

export interface DesktopCheckoutResult {
  localStatus: "committed";
  syncStatus: "pending";
  inventoryMovementIds: string[];
}
