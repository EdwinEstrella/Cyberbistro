import { supabase } from "../../../shared/lib/supabase";
import type { MenuLinkEmployee } from "./types";
import { normalizeRepoError } from "./menuLinksRepo";
import { normalizeCedula } from "./rosterParser";

export async function fetchLinkEmployees(linkId: string): Promise<MenuLinkEmployee[]> {
  try {
    const { data, error } = await supabase
      .from("menu_link_employees")
      .select("*")
      .eq("menu_link_id", linkId)
      .order("full_name", { ascending: true });

    if (error) throw error;
    return (data ?? []) as MenuLinkEmployee[];
  } catch (err) {
    throw normalizeRepoError(err, "No se pudieron cargar los empleados autorizados.");
  }
}

export async function createLinkEmployee(
  tenantId: string,
  linkId: string,
  fullName: string,
  rawCedula?: string | null
): Promise<MenuLinkEmployee> {
  try {
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      throw new Error("El nombre debe tener entre 2 y 80 caracteres.");
    }

    let documentId: string | null = null;
    if (rawCedula && rawCedula.trim()) {
      const digits = normalizeCedula(rawCedula);
      if (digits.length !== 11) {
        throw new Error("La cédula debe contener exactamente 11 dígitos.");
      }
      documentId = digits;
    }

    const { data, error } = await supabase
      .from("menu_link_employees")
      .insert([
        {
          tenant_id: tenantId,
          menu_link_id: linkId,
          full_name: trimmedName,
          document_id: documentId,
          active: true,
        },
      ])
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        throw new Error("Ya existe un empleado con ese nombre o cédula en este link.");
      }
      throw error;
    }

    return data as MenuLinkEmployee;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo registrar el empleado.");
  }
}

export async function updateLinkEmployee(
  id: string,
  fullName: string,
  rawCedula?: string | null
): Promise<void> {
  try {
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      throw new Error("El nombre debe tener entre 2 y 80 caracteres.");
    }

    let documentId: string | null = null;
    if (rawCedula && rawCedula.trim()) {
      const digits = normalizeCedula(rawCedula);
      if (digits.length !== 11) {
        throw new Error("La cédula debe contener exactamente 11 dígitos.");
      }
      documentId = digits;
    }

    const { error } = await supabase
      .from("menu_link_employees")
      .update({
        full_name: trimmedName,
        document_id: documentId,
      })
      .eq("id", id);

    if (error) {
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        throw new Error("Ya existe otro empleado con ese nombre o cédula.");
      }
      throw error;
    }
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo actualizar el empleado.");
  }
}

export async function toggleLinkEmployeeActive(id: string, active: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from("menu_link_employees")
      .update({ active })
      .eq("id", id);

    if (error) throw error;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo cambiar el estado del empleado.");
  }
}

export async function deleteLinkEmployee(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("menu_link_employees")
      .delete()
      .eq("id", id);

    if (error) throw error;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo eliminar el empleado.");
  }
}

export async function setLinkRequireRoster(linkId: string, requireRoster: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from("menu_links")
      .update({ require_roster: requireRoster })
      .eq("id", linkId);

    if (error) throw error;
  } catch (err) {
    throw normalizeRepoError(err, "No se pudo actualizar la configuración del link.");
  }
}

export async function bulkInsertLinkEmployees(
  tenantId: string,
  linkId: string,
  employees: Array<{ fullName: string; documentId: string | null }>
): Promise<{ insertedCount: number }> {
  try {
    if (employees.length === 0) return { insertedCount: 0 };

    const records = employees.map((e) => ({
      tenant_id: tenantId,
      menu_link_id: linkId,
      full_name: e.fullName.trim(),
      document_id: e.documentId,
      active: true,
    }));

    const { data, error } = await supabase
      .from("menu_link_employees")
      .upsert(records, { onConflict: "menu_link_id,lower(full_name)" })
      .select("id");

    if (error) {
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        throw new Error("Una o más cédulas ya están registradas en este link.");
      }
      throw error;
    }

    return { insertedCount: (data ?? []).length };
  } catch (err) {
    throw normalizeRepoError(err, "No se pudieron importar los empleados.");
  }
}

export async function fetchLinkEmployeeCounts(linkIds: string[]): Promise<Record<string, number>> {
  if (linkIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("menu_link_employees")
      .select("menu_link_id")
      .in("menu_link_id", linkIds);

    if (error || !data) return {};

    const counts: Record<string, number> = {};
    for (const row of data) {
      const lid = row.menu_link_id as string;
      counts[lid] = (counts[lid] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}
