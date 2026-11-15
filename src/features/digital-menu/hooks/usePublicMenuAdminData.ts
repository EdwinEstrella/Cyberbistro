import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "../../../shared/lib/supabase";
import { readLocalMirror } from "../../../shared/lib/localFirst";
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
      const [platosLocal, settingsLocal, itemsLocal, tenantMenus, tableCount] = await Promise.all([
        readLocalMirror<Plato>(tenantId, "platos").catch(() => []),
        readLocalMirror<DigitalMenuSettings>(tenantId, "digital_menu_settings").catch(() => []),
        readLocalMirror<DigitalMenuItem>(tenantId, "digital_menu_items").catch(() => []),
        fetchMenus(tenantId, sucursalId).catch(() => []),
        fetchTableCount(tenantId, sucursalId),
      ]);

      const filteredPlatos = platosLocal.filter(
        (p) => !p.sucursal_id || p.sucursal_id === sucursalId
      );

      let tenantSettings = pickPublicMenuSettings(settingsLocal, tenantId, sucursalId);

      // If not in local mirror, fetch tenant rows from cloud and pick
      if (!tenantSettings && (typeof navigator === "undefined" || navigator.onLine)) {
        const { data: cloudRows } = await supabase
          .from("digital_menu_settings")
          .select("*")
          .eq("tenant_id", tenantId);

        if (cloudRows && cloudRows.length > 0) {
          tenantSettings = pickPublicMenuSettings(
            cloudRows as DigitalMenuSettings[],
            tenantId,
            sucursalId
          );
        }
      }

      const tenantMenuItems = itemsLocal.filter((mi) => mi.tenant_id === tenantId);

      setData({
        settings: tenantSettings,
        menus: tenantMenus,
        platos: filteredPlatos,
        menuItems: tenantMenuItems,
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
