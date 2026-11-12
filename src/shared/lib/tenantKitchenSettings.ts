import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  isCloudAvailabilityFailure,
  isDesktopCloudUnavailable,
  recordCloudFailure,
  recordCloudSuccess,
} from "./cloudAvailability";
import { readLocalMirror } from "./localFirst";

/**
 * Normalizes kitchen_enabled value with default TRUE (fail safe).
 * Only an explicit boolean false disables the kitchen.
 */
export function normalizeKitchenEnabled(val: unknown): boolean {
  if (val === false) return false;
  return true;
}

async function loadLocalTenantKitchenSettings(tenantId: string): Promise<boolean> {
  try {
    const tenants = await readLocalMirror<{ id?: string; kitchen_enabled?: boolean | null }>(
      tenantId,
      "tenants"
    );
    const tenant = tenants.find((row) => row.id === tenantId);
    return normalizeKitchenEnabled(tenant?.kitchen_enabled);
  } catch {
    return true; // Default TRUE on any error / unknown
  }
}

/**
 * Reads kitchen_enabled for the tenant.
 * Uses cloud when online and reachable, falls back to local mirror when offline
 * or on cloud error, and defaults to TRUE on any error or missing data.
 */
export async function loadTenantKitchenSettings(
  tenantId: string | null | undefined
): Promise<boolean> {
  if (!tenantId) return true;

  if (await isDesktopCloudUnavailable().catch(() => true)) {
    return loadLocalTenantKitchenSettings(tenantId);
  }

  type CloudRes = { data: { kitchen_enabled?: boolean | null } | null; error: unknown };
  let res: CloudRes;

  try {
    res = (await supabase
      .from("tenants")
      .select("kitchen_enabled")
      .eq("id", tenantId)
      .maybeSingle()) as CloudRes;
  } catch (error) {
    if (isCloudAvailabilityFailure(error)) recordCloudFailure();
    res = { data: null, error };
  }

  if (res.error || !res.data) {
    if (res.error && isCloudAvailabilityFailure(res.error)) recordCloudFailure();
    return loadLocalTenantKitchenSettings(tenantId);
  }

  recordCloudSuccess();
  return normalizeKitchenEnabled(res.data.kitchen_enabled);
}

/**
 * React hook for reading kitchen_enabled with default true and automatic resolution.
 */
export function useKitchenEnabled(tenantId?: string | null): boolean {
  const [kitchenEnabled, setKitchenEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (!tenantId) {
      setKitchenEnabled(true);
      return;
    }
    let active = true;
    void loadTenantKitchenSettings(tenantId).then((val) => {
      if (active) setKitchenEnabled(val);
    });
    return () => {
      active = false;
    };
  }, [tenantId]);

  return kitchenEnabled;
}
