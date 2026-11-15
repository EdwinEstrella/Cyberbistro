import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "../../../shared/lib/supabase";
import {
  readLocalMirror,
  shouldReadLocalFirst,
  type LocalFirstMirrorTable,
} from "../../../shared/lib/localFirst";
import { readLocalPlatos, normalizePlato } from "../../soporte/lib/catalogLocal";
import type { Menu } from "../../menu-links/lib/types";
import { fetchMenus } from "../../menu-links/lib/menuLinksRepo";
import {
  type DigitalMenuSettings,
  pickPublicMenuSettings,
} from "../../menu-links/lib/publicMenuCalendar";
import type { Plato, DigitalMenuItem } from "./usePublicMenuDishes";

export interface PublicMenuAdminInitialData {
  settings: DigitalMenuSettings | null;
  menus: Menu[];
  platos: Plato[];
  menuItems: DigitalMenuItem[];
  tableCount: number;
}

export interface UsePublicMenuAdminDataParams {
  tenantId: string;
  sucursalId?: string | null;
}

export interface PublicMenuAdminSources {
  settings: DigitalMenuSettings | null;
  platos: Plato[];
  menuItems: DigitalMenuItem[];
}

export interface PublicMenuAdminCloudResult<T> {
  data: T[] | null;
  error: { message?: string; [key: string]: unknown } | null;
}

export interface PublicMenuAdminReaders {
  shouldReadLocalFirst?: (
    tenantId: string,
    tables?: readonly LocalFirstMirrorTable[]
  ) => Promise<boolean>;
  readLocalPlatos?: (tenantId: string) => Promise<Array<Record<string, unknown>>>;
  readLocalMirror?: <T>(tenantId: string, table: LocalFirstMirrorTable) => Promise<T[]>;
  fetchCloudPlatos?: (
    tenantId: string
  ) => Promise<PublicMenuAdminCloudResult<Plato | Record<string, unknown>>>;
  fetchCloudSettings?: (
    tenantId: string
  ) => Promise<PublicMenuAdminCloudResult<DigitalMenuSettings>>;
  fetchCloudMenuItems?: (
    tenantId: string
  ) => Promise<PublicMenuAdminCloudResult<DigitalMenuItem>>;
}

export interface LoadPublicMenuAdminSourcesParams {
  tenantId: string;
  sucursalId?: string | null;
  localFirst?: boolean;
  readers?: PublicMenuAdminReaders;
}

const defaultFetchCloudPlatos = async (tenantId: string) => {
  const res = await supabase.from("platos").select("*").eq("tenant_id", tenantId);
  return res as PublicMenuAdminCloudResult<Plato>;
};

const defaultFetchCloudSettings = async (tenantId: string) => {
  const res = await supabase
    .from("digital_menu_settings")
    .select("*")
    .eq("tenant_id", tenantId);
  return res as PublicMenuAdminCloudResult<DigitalMenuSettings>;
};

const defaultFetchCloudMenuItems = async (tenantId: string) => {
  const res = await supabase
    .from("digital_menu_items")
    .select("*")
    .eq("tenant_id", tenantId);
  return res as PublicMenuAdminCloudResult<DigitalMenuItem>;
};

/**
 * Loads the underlying data sources for public menu administration:
 * - On local-first (desktop): reads platos via readLocalPlatos and settings/items via readLocalMirror,
 *   with cloud fallback for settings if not present in the local mirror.
 * - On web (server-first): reads platos, digital_menu_settings, and digital_menu_items directly from Supabase.
 *   Surfaces Supabase errors by throwing so consumers (e.g. usePublicMenuAdminData) can display error toasts.
 */
export async function loadPublicMenuAdminSources({
  tenantId,
  sucursalId,
  localFirst,
  readers,
}: LoadPublicMenuAdminSourcesParams): Promise<PublicMenuAdminSources> {
  if (!tenantId) {
    return {
      settings: null,
      platos: [],
      menuItems: [],
    };
  }

  const isLocalFirst =
    typeof localFirst === "boolean"
      ? localFirst
      : await (readers?.shouldReadLocalFirst ?? shouldReadLocalFirst)(tenantId, [
          "platos",
          "digital_menu_settings",
          "digital_menu_items",
        ]).catch(() => false);

  if (isLocalFirst) {
    const readPlatos = readers?.readLocalPlatos ?? readLocalPlatos;
    const readMirror = readers?.readLocalMirror ?? readLocalMirror;

    const [rawPlatos, settingsLocal, itemsLocal] = await Promise.all([
      readPlatos(tenantId).catch(() => []),
      readMirror<DigitalMenuSettings>(tenantId, "digital_menu_settings").catch(() => []),
      readMirror<DigitalMenuItem>(tenantId, "digital_menu_items").catch(() => []),
    ]);

    const normalizedPlatos = rawPlatos.map((raw) => normalizePlato(raw) as unknown as Plato);
    const filteredPlatos = normalizedPlatos.filter(
      (p) => !p.sucursal_id || p.sucursal_id === sucursalId
    );

    let tenantSettings = pickPublicMenuSettings(settingsLocal, tenantId, sucursalId);

    // If not in local mirror, fetch tenant rows from cloud and pick
    if (!tenantSettings && (typeof navigator === "undefined" || navigator.onLine)) {
      const fetchSettings = readers?.fetchCloudSettings ?? defaultFetchCloudSettings;
      const { data: cloudRows } = await fetchSettings(tenantId).catch(() => ({
        data: null,
        error: null,
      }));

      if (cloudRows && cloudRows.length > 0) {
        tenantSettings = pickPublicMenuSettings(
          cloudRows as DigitalMenuSettings[],
          tenantId,
          sucursalId
        );
      }
    }

    const tenantMenuItems = itemsLocal.filter((mi) => mi.tenant_id === tenantId);

    return {
      settings: tenantSettings,
      platos: filteredPlatos,
      menuItems: tenantMenuItems,
    };
  }

  const fetchPlatos = readers?.fetchCloudPlatos ?? defaultFetchCloudPlatos;
  const fetchSettings = readers?.fetchCloudSettings ?? defaultFetchCloudSettings;
  const fetchMenuItems = readers?.fetchCloudMenuItems ?? defaultFetchCloudMenuItems;

  const [platosRes, settingsRes, itemsRes] = await Promise.all([
    fetchPlatos(tenantId),
    fetchSettings(tenantId),
    fetchMenuItems(tenantId),
  ]);

  if (platosRes.error) throw platosRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const rawPlatos = (platosRes.data ?? []) as Array<Record<string, unknown>>;
  const normalizedPlatos = rawPlatos.map((raw) => normalizePlato(raw) as unknown as Plato);
  const filteredPlatos = normalizedPlatos.filter(
    (p) => !p.sucursal_id || p.sucursal_id === sucursalId
  );

  const cloudSettings = (settingsRes.data ?? []) as DigitalMenuSettings[];
  const tenantSettings = pickPublicMenuSettings(cloudSettings, tenantId, sucursalId);

  const rawMenuItems = (itemsRes.data ?? []) as DigitalMenuItem[];
  const tenantMenuItems = rawMenuItems.filter((mi) => mi.tenant_id === tenantId);

  return {
    settings: tenantSettings,
    platos: filteredPlatos,
    menuItems: tenantMenuItems,
  };
}

/**
 * Resolves the configured table count for a restaurant / branch.
 * Follows the same hierarchy as the public menu RPC and Tables screen:
 * 1. Branch cantidad_mesas (if sucursalId provided and > 0)
 * 2. Tenant cantidad_mesas
 * 3. 0 if unconfigured
 */
export async function fetchTableCount(
  tenantId: string,
  sucursalId?: string | null
): Promise<number> {
  if (!tenantId) return 0;
  try {
    if (sucursalId) {
      const sucursales = await readLocalMirror<{ id: string; cantidad_mesas?: number | null }>(
        tenantId,
        "sucursales"
      ).catch(() => []);
      const sucursal = sucursales.find((s) => s.id === sucursalId);
      if (sucursal && typeof sucursal.cantidad_mesas === "number" && sucursal.cantidad_mesas > 0) {
        return sucursal.cantidad_mesas;
      }
    }

    const tenants = await readLocalMirror<{ id: string; cantidad_mesas?: number | null }>(
      tenantId,
      "tenants"
    ).catch(() => []);
    const tenant = tenants.find((t) => t.id === tenantId);
    if (tenant && typeof tenant.cantidad_mesas === "number" && tenant.cantidad_mesas > 0) {
      return tenant.cantidad_mesas;
    }

    if (typeof navigator === "undefined" || navigator.onLine) {
      if (sucursalId) {
        const { data: sucData } = await supabase
          .from("sucursales")
          .select("cantidad_mesas")
          .eq("id", sucursalId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (sucData && typeof sucData.cantidad_mesas === "number" && sucData.cantidad_mesas > 0) {
          return sucData.cantidad_mesas;
        }
      }

      const { data: tenantData } = await supabase
        .from("tenants")
        .select("cantidad_mesas")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenantData && typeof tenantData.cantidad_mesas === "number") {
        return tenantData.cantidad_mesas;
      }
    }
  } catch (err) {
    console.warn("[usePublicMenuAdminData] Error resolving table count:", err);
  }

  return 0;
}

export function usePublicMenuAdminData({ tenantId, sucursalId }: UsePublicMenuAdminDataParams) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicMenuAdminInitialData>({
    settings: null,
    menus: [],
    platos: [],
    menuItems: [],
    tableCount: 0,
  });

  const loadData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [sources, tenantMenus, tableCount] = await Promise.all([
        loadPublicMenuAdminSources({ tenantId, sucursalId }),
        fetchMenus(tenantId, sucursalId).catch(() => []),
        fetchTableCount(tenantId, sucursalId),
      ]);

      setData({
        settings: sources.settings,
        menus: tenantMenus,
        platos: sources.platos,
        menuItems: sources.menuItems,
        tableCount,
      });
    } catch (err) {
      console.error("Error loading public menu admin data:", err);
      toast.error("No se pudo cargar la configuración del menú público.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, sucursalId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return {
    loading,
    data,
    loadData,
  };
}
