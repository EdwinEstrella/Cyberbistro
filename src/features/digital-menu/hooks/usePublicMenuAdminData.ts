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
}

export interface UsePublicMenuAdminDataParams {
  tenantId: string;
  sucursalId?: string | null;
}

export function usePublicMenuAdminData({ tenantId, sucursalId }: UsePublicMenuAdminDataParams) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicMenuAdminInitialData>({
    settings: null,
    menus: [],
    platos: [],
    menuItems: [],
  });

  const loadData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [platosLocal, settingsLocal, itemsLocal, tenantMenus] = await Promise.all([
        readLocalMirror<Plato>(tenantId, "platos").catch(() => []),
        readLocalMirror<DigitalMenuSettings>(tenantId, "digital_menu_settings").catch(() => []),
        readLocalMirror<DigitalMenuItem>(tenantId, "digital_menu_items").catch(() => []),
        fetchMenus(tenantId, sucursalId).catch(() => []),
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
