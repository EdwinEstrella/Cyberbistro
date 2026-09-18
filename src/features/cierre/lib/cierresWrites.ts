import {
  openOperatingCycle,
  closeOperatingCycle,
  markOperatingCyclePrinted,
  discardOperatingCycle,
} from "../../../shared/lib/ordersUiAdapter";
import { enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";

/**
 * Operational-cycle writes go through exactly one engine per runtime:
 *
 * - Desktop (SQLite bridge available): the SQLite main process is the single
 *   source of truth AND the single Supabase cycle creator. IndexedDB never
 *   writes or pushes cierres on desktop (see pushOutboxToServer).
 * - Web (no SQLite bridge): IndexedDB stays the single cycle engine.
 *
 * Splitting a cycle's lifecycle across both engines is what produced duplicate
 * cycles, so this module keeps every open/close/discard/print on one engine.
 */
function hasSqliteCycles(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.executeOrdersCommand);
}

export interface OpenCycleInput {
  tenantId: string;
  sucursalId: string;
  cycleId: string;
  cycleNumber: number;
  businessDay: string;
  openedAtIso: string;
  efectivoInicial: number;
  openedByAuthUserId?: string | null;
}

export async function writeCycleOpen(input: OpenCycleInput): Promise<void> {
  if (hasSqliteCycles()) {
    await openOperatingCycle(input.cycleId, input.businessDay, input.efectivoInicial, input.cycleNumber, input.openedAtIso, input.sucursalId);
    return;
  }
  await enqueueLocalWrite({
    tenantId: input.tenantId,
    tableName: "cierres_operativos",
    rowId: input.cycleId,
    op: "insert",
    payload: {
      id: input.cycleId,
      tenant_id: input.tenantId,
      sucursal_id: input.sucursalId,
      business_day: input.businessDay,
      cycle_number: input.cycleNumber,
      efectivo_inicial: input.efectivoInicial,
      opened_by_auth_user_id: input.openedByAuthUserId,
      opened_at: input.openedAtIso,
      created_at: input.openedAtIso,
      closed_at: null,
    },
    deviceId: await getDeviceId(),
  });
}

export async function writeCycleClose(input: { tenantId: string; cycleId: string; closedAtIso: string; closedByAuthUserId?: string | null }): Promise<void> {
  if (hasSqliteCycles()) {
    await closeOperatingCycle(input.cycleId, input.closedAtIso);
    return;
  }
  await enqueueLocalWrite({
    tenantId: input.tenantId,
    tableName: "cierres_operativos",
    rowId: input.cycleId,
    op: "update",
    payload: { closed_at: input.closedAtIso, closed_by_auth_user_id: input.closedByAuthUserId ?? null },
    deviceId: await getDeviceId(),
  });
}

export async function writeCycleDiscard(input: { tenantId: string; cycleId: string }): Promise<void> {
  if (hasSqliteCycles()) {
    await discardOperatingCycle(input.cycleId);
    return;
  }
  await enqueueLocalWrite({
    tenantId: input.tenantId,
    tableName: "cierres_operativos",
    rowId: input.cycleId,
    op: "delete",
    deviceId: await getDeviceId(),
  });
}

export async function writeCyclePrinted(input: { tenantId: string; cycleId: string; printedAtIso: string }): Promise<void> {
  if (hasSqliteCycles()) {
    await markOperatingCyclePrinted(input.cycleId, input.printedAtIso);
    return;
  }
  await enqueueLocalWrite({
    tenantId: input.tenantId,
    tableName: "cierres_operativos",
    rowId: input.cycleId,
    op: "update",
    payload: { printed_at: input.printedAtIso },
    deviceId: await getDeviceId(),
  });
}
