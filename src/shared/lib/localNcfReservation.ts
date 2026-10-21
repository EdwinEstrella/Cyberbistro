/**
 * Desktop NCF reservation. SQLite in the Electron main process keeps a local
 * NCF B counter (one sales caja per business), so fiscal sales keep working
 * while the cloud is down. When the cloud is reachable its RPC stays
 * authoritative; the reserved number is recorded locally so the local counter
 * never lags, and a cloud counter that lags numbers issued offline is advanced
 * with a monotonic conditional update (it never moves backwards).
 *
 * e-CF (E31/E32) stays cloud-only: those numbers are range-enforced and signed
 * by the cloud (offline e-CF signing is a separate feature).
 */
import { supabase } from "./supabase";
import { isCloudAvailabilityFailure, isDesktopCloudUnavailable } from "./cloudAvailability";
import { resolveNcfForNewInvoice, type ResolvedNcfForInvoice } from "./invoiceNcf";
import { getNcfSequenceColumnName, isNcfBCode, ncfPayloadFromReservedSequence } from "./ncf";
import type {
  NcfLocalPeek,
  NcfLocalReservation,
  NcfLocalSequenceRequest,
  NcfLocalSequenceResponse,
} from "../../../electron/persistence/ncfLocalSequence";

export type NcfLocalSequenceBridge = (request: NcfLocalSequenceRequest) => Promise<NcfLocalSequenceResponse>;

export interface DesktopNcfDeps {
  bridge: NcfLocalSequenceBridge | undefined;
  isCloudUnavailable: () => Promise<boolean>;
  cloudReserve: (tenantId: string, preferredType?: string | null) => Promise<ResolvedNcfForInvoice | null>;
  /** Advances the cloud counter to at least `nextSequence`; true once the cloud is known to be there. */
  catchUpCloud: (tenantId: string, tipoCodigo: string, nextSequence: number) => Promise<boolean>;
}

async function callBridge<T>(bridge: NcfLocalSequenceBridge, request: NcfLocalSequenceRequest): Promise<T> {
  const res = await bridge(request);
  if (!res.ok) throw new Error(res.message);
  return res.data as T;
}

function isCloudOutage(error: unknown): boolean {
  return Boolean((error as { cloudUnavailable?: unknown } | null)?.cloudUnavailable) || isCloudAvailabilityFailure(error);
}

async function reserveLocal(
  bridge: NcfLocalSequenceBridge,
  tenantId: string,
  preferredType?: string | null,
): Promise<ResolvedNcfForInvoice> {
  const reservation = await callBridge<NcfLocalReservation>(bridge, { action: "reserve", tenantId, preferredType: preferredType ?? null });
  const payload = ncfPayloadFromReservedSequence(reservation.tipoCodigo, reservation.sequence);
  if (!payload) throw new Error("No se pudo reservar NCF local.");
  return { ...payload, sequenceReservedAtomically: true, reservationSource: "local_sqlite" };
}

async function recordQuietly(
  bridge: NcfLocalSequenceBridge,
  tenantId: string,
  tipoCodigo: string,
  sequence: number,
  source: "cloud" | "local",
): Promise<void> {
  try {
    await callBridge(bridge, { action: "record", tenantId, tipoCodigo, sequence, source });
  } catch (error) {
    // The pulled facturas still raise the local floor later; never block a sale on this.
    console.warn("[localNcfReservation] could not record NCF locally:", error);
  }
}

export async function resolveNcfForNewInvoiceDesktop(
  tenantId: string,
  preferredType?: string | null,
  deps: DesktopNcfDeps = defaultDesktopNcfDeps(),
): Promise<ResolvedNcfForInvoice | null> {
  const isEcf = Boolean(preferredType?.trim().toUpperCase().startsWith("E"));
  const bridge = deps.bridge;
  if (isEcf || !bridge) return deps.cloudReserve(tenantId, preferredType);

  if (await deps.isCloudUnavailable().catch(() => true)) {
    return reserveLocal(bridge, tenantId, preferredType);
  }

  // Before asking the cloud, make sure its counter is not behind numbers this
  // device issued while offline.
  const peek = await peekLocal(bridge, tenantId, preferredType);
  if (peek && peek.localNextSequence > peek.cloudNextSequence) {
    const caughtUp = await deps.catchUpCloud(tenantId, peek.tipoCodigo, peek.localNextSequence).catch(() => false);
    if (!caughtUp) {
      // The cloud would hand out a number this device already used: do not burn
      // a cloud number, stay on the local sequence until the catch-up succeeds.
      console.warn(`[localNcfReservation] cloud ${peek.tipoCodigo} counter lags local issuance; using local sequence.`);
      return reserveLocal(bridge, tenantId, preferredType);
    }
    await recordQuietly(bridge, tenantId, peek.tipoCodigo, peek.localNextSequence - 1, "cloud");
  }

  let cloud: ResolvedNcfForInvoice | null;
  try {
    cloud = await deps.cloudReserve(tenantId, preferredType);
  } catch (error) {
    // A timed-out RPC may still have committed: that cloud number is simply
    // left unused (a gap), never issued twice.
    if (isCloudOutage(error)) return reserveLocal(bridge, tenantId, preferredType);
    throw error;
  }
  if (!cloud || !isNcfBCode(cloud.tipoCodigo)) return cloud;

  // Fresh peek for the type the cloud actually used (the tenant default may
  // differ from the local copy), taken before recording the cloud number.
  const after = await peekLocal(bridge, tenantId, cloud.tipoCodigo);
  const fromAtomicRpc = cloud.reservationSource === "remote_rpc";
  await recordQuietly(bridge, tenantId, cloud.tipoCodigo, cloud.usedSequence, fromAtomicRpc ? "cloud" : "local");

  // The cloud counter still lags: its number may already be on an invoice
  // issued offline. Never reuse it; the local counter is past both.
  if (after && cloud.usedSequence < after.localNextSequence) {
    console.warn(`[localNcfReservation] cloud ${cloud.tipoCodigo} counter lags local issuance; using local sequence.`);
    return reserveLocal(bridge, tenantId, cloud.tipoCodigo);
  }
  return cloud;
}

async function peekLocal(bridge: NcfLocalSequenceBridge, tenantId: string, preferredType?: string | null): Promise<NcfLocalPeek | null> {
  return callBridge<NcfLocalPeek>(bridge, { action: "peek", tenantId, preferredType: preferredType ?? null }).catch(() => null);
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

/**
 * Advances the cloud counter to at least `nextSequence`, never backwards, via
 * the SECURITY DEFINER RPC `cloudix_advance_ncf_sequence` (any active member).
 * Until that migration is deployed, falls back to a conditional UPDATE
 * (`... WHERE col IS NULL OR col < n`), which RLS only allows for admins.
 */
export async function catchUpCloudNcfSequence(tenantId: string, tipoCodigo: string, nextSequence: number): Promise<boolean> {
  if (!isNcfBCode(tipoCodigo) || !Number.isSafeInteger(nextSequence) || nextSequence < 1) return false;
  const rpc = await supabase.rpc("cloudix_advance_ncf_sequence", {
    p_tenant_id: tenantId,
    p_ncf_tipo: tipoCodigo,
    p_next: nextSequence,
  });
  if (!rpc.error) return typeof rpc.data === "number" && rpc.data >= nextSequence;
  if (!isMissingRpc(rpc.error)) return false;

  const column = getNcfSequenceColumnName(tipoCodigo);
  const updated = await supabase
    .from("tenants")
    .update({ [column]: nextSequence, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .or(`${column}.is.null,${column}.lt.${nextSequence}`)
    .select("id");
  if (updated.error) return false;
  if (Array.isArray(updated.data) && updated.data.length > 0) return true;
  // No row updated: either the cloud is already ahead, or the update was
  // filtered out (RLS). Only a read can tell them apart.
  const current = await supabase.from("tenants").select(column).eq("id", tenantId).maybeSingle();
  const value = (current.data as Record<string, unknown> | null)?.[column];
  return !current.error && typeof value === "number" && value >= nextSequence;
}

export function defaultDesktopNcfDeps(): DesktopNcfDeps {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  return {
    bridge: api?.ncfLocalSequence,
    isCloudUnavailable: isDesktopCloudUnavailable,
    cloudReserve: resolveNcfForNewInvoice,
    catchUpCloud: catchUpCloudNcfSequence,
  };
}
