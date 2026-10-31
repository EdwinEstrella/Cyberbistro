import { supabase } from "../../../shared/lib/supabase";
import type { Menu, MenuItem, MenuLink, ScheduleMode, LinkType } from "./types";
import type { MenuItemsDiffResult } from "./menuItemsDiff";
import { addWeeks } from "./menuSchedule";

/**
 * Checks whether an error is caused by a missing internet connection or network failure.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }
  const msg = (error as any).message ? String((error as any).message).toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("connection refused") ||
    msg.includes("fetch failed") ||
    msg.includes("se requiere conexión a internet") ||
    ((error as any).name === "TypeError" && msg.includes("fetch"))
  );
}

/**
 * Normalizes API and network errors to present clear messages to the user.
 */
export function normalizeRepoError(error: unknown, fallbackMessage = "Error al procesar la solicitud."): Error {
  if (typeof error === "object" && error !== null) {
    const err = error as any;
    if (err.code === "23503" || err.message?.includes("violates foreign key constraint")) {
      return new Error("No se puede eliminar este menú porque está asignado a uno o más links.");
    }
  }

  if (isNetworkError(error)) {
    return new Error("Se requiere conexión a internet");
  }

  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null && (error as any).message) {
    return new Error(String((error as any).message));
  }
  return new Error(fallbackMessage);
}

export async function fetchMenuLinks(tenantId: string, sucursalId?: string | null): Promise<MenuLink[]> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    let query = supabase
      .from("menu_links")
      .select("*, menu:menus(id, name, schedule_mode, week_start), customer:customers(id, name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (sucursalId) {
      query = query.or(`sucursal_id.is.null,sucursal_id.eq.${sucursalId}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as MenuLink[];
  } catch (err) {
    throw normalizeRepoError(err, "No se pudieron cargar los links de menú.");
  }
}

export interface CreateMenuLinkInput {
  tenantId: string;
  sucursalId?: string | null;
  menuId: string;
  label: string;
  linkType: LinkType;
  customerId?: string | null;
  allowExtras: boolean;
}

export async function createMenuLink(input: CreateMenuLinkInput): Promise<MenuLink> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const { data, error } = await supabase
      .from("menu_links")
      .insert([
        {
          tenant_id: input.tenantId,
          sucursal_id: input.sucursalId || null,
          menu_id: input.menuId,
          label: input.label.trim(),
          link_type: input.linkType,
          customer_id: input.linkType === "company" ? (input.customerId || null) : null,
          allow_extras: input.allowExtras,
          enabled: true,
        },
      ])
      .select("*, menu:menus(id, name, schedule_mode, week_start), customer:customers(id, name)")
      .single();

    if (error) throw error;
    return data as unknown as MenuLink;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo crear el link de menú.");
  }
}

export async function toggleMenuLinkEnabled(linkId: string, enabled: boolean): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const { error } = await supabase
      .from("menu_links")
      .update({ enabled })
      .eq("id", linkId);

    if (error) throw error;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo actualizar el estado del link.");
  }
}

export async function fetchMenus(tenantId: string, sucursalId?: string | null): Promise<Menu[]> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    let query = supabase
      .from("menus")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (sucursalId) {
      query = query.or(`sucursal_id.is.null,sucursal_id.eq.${sucursalId}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Menu[];
  } catch (err) {
    throw normalizeRepoError(err, "No se pudieron cargar los menús.");
  }
}

export async function fetchMenuById(menuId: string): Promise<{ menu: Menu; items: MenuItem[] }> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const [menuRes, itemsRes] = await Promise.all([
      supabase.from("menus").select("*").eq("id", menuId).single(),
      supabase.from("menu_items").select("*").eq("menu_id", menuId).order("sort_order", { ascending: true }),
    ]);

    if (menuRes.error) throw menuRes.error;
    if (itemsRes.error) throw itemsRes.error;

    return {
      menu: menuRes.data as Menu,
      items: (itemsRes.data ?? []) as MenuItem[],
    };
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo cargar la información del menú.");
  }
}

export interface CreateMenuInput {
  tenantId: string;
  sucursalId?: string | null;
  name: string;
  scheduleMode: ScheduleMode;
  weekStart?: string | null;
}

export async function createMenu(input: CreateMenuInput): Promise<Menu> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const { data, error } = await supabase
      .from("menus")
      .insert([
        {
          tenant_id: input.tenantId,
          sucursal_id: input.sucursalId || null,
          name: input.name.trim(),
          schedule_mode: input.scheduleMode,
          week_start: input.scheduleMode === "weekly" ? input.weekStart : null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Menu;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo crear el menú.");
  }
}

export async function updateMenu(
  menuId: string,
  updates: { name?: string; schedule_mode?: ScheduleMode; week_start?: string | null }
): Promise<Menu> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.schedule_mode !== undefined) payload.schedule_mode = updates.schedule_mode;
    if (updates.week_start !== undefined) payload.week_start = updates.week_start;

    const { data, error } = await supabase
      .from("menus")
      .update(payload)
      .eq("id", menuId)
      .select()
      .single();

    if (error) throw error;
    return data as Menu;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo actualizar el menú.");
  }
}

export async function deleteMenu(menuId: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const { error } = await supabase
      .from("menus")
      .delete()
      .eq("id", menuId);

    if (error) throw error;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo eliminar el menú.");
  }
}

export async function duplicateMenu(
  originalMenuId: string,
  tenantId: string,
  options?: { newName?: string; nextWeek?: boolean }
): Promise<Menu> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const { menu, items } = await fetchMenuById(originalMenuId);

    let weekStart = menu.week_start;
    if (menu.schedule_mode === "weekly" && options?.nextWeek && menu.week_start) {
      weekStart = addWeeks(menu.week_start, 1);
    }

    const newName = options?.newName?.trim() || `${menu.name} (Copia)`;

    const newMenu = await createMenu({
      tenantId,
      sucursalId: menu.sucursal_id,
      name: newName,
      scheduleMode: menu.schedule_mode,
      weekStart,
    });

    if (items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        tenant_id: tenantId,
        menu_id: newMenu.id,
        plato_id: item.plato_id,
        weekdays: item.weekdays,
        sort_order: item.sort_order,
        display_name: item.display_name,
      }));

      const { error: insertItemsError } = await supabase
        .from("menu_items")
        .insert(itemsToInsert);

      if (insertItemsError) throw insertItemsError;
    }

    return newMenu;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo duplicar el menú.");
  }
}

export async function saveMenuItemsDiff(
  menuId: string,
  tenantId: string,
  diff: MenuItemsDiffResult
): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    // 1. Delete removed items
    if (diff.toDelete.length > 0) {
      const idsToDelete = diff.toDelete.map((item) => item.id);
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .in("id", idsToDelete);
      if (error) throw error;
    }

    // 2. Insert new items
    if (diff.toInsert.length > 0) {
      const rows = diff.toInsert.map((item) => ({
        tenant_id: tenantId,
        menu_id: menuId,
        plato_id: item.plato_id,
        weekdays: item.weekdays,
        sort_order: item.sort_order,
        display_name: item.display_name,
      }));
      const { error } = await supabase
        .from("menu_items")
        .insert(rows);
      if (error) throw error;
    }

    // 3. Update existing items
    if (diff.toUpdate.length > 0) {
      await Promise.all(
        diff.toUpdate.map(async (item) => {
          const { error } = await supabase
            .from("menu_items")
            .update({
              weekdays: item.weekdays,
              sort_order: item.sort_order,
              display_name: item.display_name,
            })
            .eq("id", item.id);
          if (error) throw error;
        })
      );
    }
  } catch (err) {
    throw normalizeRepoError(err, "No se pudieron guardar los cambios de platos del menú.");
  }
}

export async function fetchSoldOutForDate(tenantId: string, dateStr: string): Promise<number[]> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    const { data, error } = await supabase
      .from("plato_sold_out")
      .select("plato_id")
      .eq("tenant_id", tenantId)
      .eq("sold_out_date", dateStr);

    if (error) throw error;
    return (data ?? []).map((row: any) => row.plato_id as number);
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo obtener el estado de platos agotados.");
  }
}

export async function togglePlatoSoldOut(
  tenantId: string,
  platoId: number,
  dateStr: string,
  soldOut: boolean
): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Se requiere conexión a internet");
    }

    if (soldOut) {
      const { error } = await supabase
        .from("plato_sold_out")
        .upsert(
          [
            {
              tenant_id: tenantId,
              plato_id: platoId,
              sold_out_date: dateStr,
            },
          ],
          { onConflict: "tenant_id,plato_id,sold_out_date" }
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("plato_sold_out")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("plato_id", platoId)
        .eq("sold_out_date", dateStr);
      if (error) throw error;
    }
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo actualizar el estado de agotado del plato.");
  }
}
