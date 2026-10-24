import {
  openOperatingCycle,
  closeOperatingCycle,
  markOperatingCyclePrinted,
  discardOperatingCycle,
} from "../../../shared/lib/ordersUiAdapter";
import { enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bulk-deletes the tenant's queued comandas in the cloud after a successful
 * close (one RPC, not one delete per comanda). Best effort: when the cloud is
 * unreachable the next successful close purges them (the desktop already
 * cleared its local copy). A non-uuid or missing branch means tenant-wide.
 */
async function purgeCloudComandas(tenantId: string, sucursalId: string | null | undefined): Promise<void> {
  try {
    await supabase.rpc("cloudix_purge_comandas", {
      p_tenant_id: tenantId,
      p_sucursal_id: sucursalId && UUID_RE.test(sucursalId) ? sucursalId : null,
    });
  } catch {
    // non-blocking: closing the cycle must not depend on the cloud purge
  }
}

export async function writeCycleClose(input: { tenantId: string; cycleId: string; closedAtIso: string; closedByAuthUserId?: string | null; sucursalId?: string | null }): Promise<void> {
  await closeCycleRow(input);
  await purgeCloudComandas(input.tenantId, input.sucursalId);
}

async function closeCycleRow(input: { tenantId: string; cycleId: string; closedAtIso: string; closedByAuthUserId?: string | null }): Promise<void> {
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
