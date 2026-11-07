import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { Menu } from "../../menu-links/lib/types";
import { fetchMenus, createMenu } from "../../menu-links/lib/menuLinksRepo";
import {
  type DigitalMenuSettings,
  assignPublicMenuCalendar,
  removePublicMenuCalendar,
  mapCalendarError,
} from "../../menu-links/lib/publicMenuCalendar";

export interface CreateCalendarMenuValues {
  name: string;
  mode: "recurring" | "weekly";
  weekStart: string;
}

export interface UsePublicMenuCalendarParams {
  tenantId: string;
  sucursalId?: string | null;
  initialMenus: Menu[];
  settings: DigitalMenuSettings | null;
  onSettingsUpdated: (updated: DigitalMenuSettings) => void;
}

export function usePublicMenuCalendar({
  tenantId,
  sucursalId,
  initialMenus,
  settings,
  onSettingsUpdated,
}: UsePublicMenuCalendarParams) {
  const navigate = useNavigate();

  const [menus, setMenus] = useState<Menu[]>(initialMenus);
  const [selectedCalendarMenuId, setSelectedCalendarMenuId] = useState<string>("");
  const [updatingCalendar, setUpdatingCalendar] = useState(false);
  const [creatingMenu, setCreatingMenu] = useState(false);

  useEffect(() => {
    setMenus(initialMenus);
  }, [initialMenus]);

  useEffect(() => {
    if (settings?.menu_id) {
      setSelectedCalendarMenuId(settings.menu_id);
    } else if (menus.length > 0 && !selectedCalendarMenuId) {
      setSelectedCalendarMenuId(menus[0].id);
    }
  }, [settings?.menu_id, menus, selectedCalendarMenuId]);

  const assignedMenu = useMemo(
    () => menus.find((m) => m.id === settings?.menu_id),
    [menus, settings?.menu_id]
  );

  const handleAssignCalendar = async () => {
    if (!tenantId || !selectedCalendarMenuId) return;

    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }

    try {
      setUpdatingCalendar(true);
      const updated = await assignPublicMenuCalendar(
        tenantId,
        sucursalId,
        selectedCalendarMenuId,
        settings
      );
      onSettingsUpdated(updated);
      toast.success("Calendario asignado al menú público con éxito.");
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setUpdatingCalendar(false);
    }
  };

  const handleRemoveCalendar = async () => {
    if (!tenantId) return;

    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }

    try {
      setUpdatingCalendar(true);
      const updated = await removePublicMenuCalendar(tenantId, sucursalId, settings);
      onSettingsUpdated(updated);
      toast.success(
        "Calendario quitado. El menú público mostrará la lista de platos visibles."
      );
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setUpdatingCalendar(false);
    }
  };

  const handleCreateAndAssignMenu = async (
    values: CreateCalendarMenuValues
  ): Promise<boolean> => {
    if (!tenantId) return false;

    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return false;
    }

    if (!values.name.trim()) {
      toast.error("El nombre del nuevo menú es obligatorio.");
      return false;
    }

    try {
      setCreatingMenu(true);
      const created = await createMenu({
        tenantId,
        sucursalId,
        name: values.name.trim(),
        scheduleMode: values.mode,
        weekStart: values.mode === "weekly" ? values.weekStart : null,
      });

      const freshMenus = await fetchMenus(tenantId, sucursalId);
      setMenus(freshMenus);
      setSelectedCalendarMenuId(created.id);

      const updated = await assignPublicMenuCalendar(tenantId, sucursalId, created.id, settings);
      onSettingsUpdated(updated);

      toast.success(`Menú "${created.name}" creado y asignado como calendario público.`);
      return true;
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
      return false;
    } finally {
      setCreatingMenu(false);
    }
  };

  const handleEditCalendar = useCallback(
    (menuToEditId: string) => {
      navigate(`/menu-links/menus/${menuToEditId}`);
    },
    [navigate]
  );

  return {
    menus,
    setMenus,
    selectedCalendarMenuId,
    setSelectedCalendarMenuId,
    assignedMenu,
    updatingCalendar,
    creatingMenu,
    handleAssignCalendar,
    handleRemoveCalendar,
    handleCreateAndAssignMenu,
    handleEditCalendar,
  };
}
