import { supabase } from "./supabase";

function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export async function readLocalMesasEstado(
  tenantId: string,
  sucursalId?: string | null
): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  if (api?.listMesasEstado) {
    try {
      const res = await api.listMesasEstado({ tenantId, sucursalId: sucursalId || undefined });
      if (res?.ok && Array.isArray(res.data)) return res.data;
    } catch (e) {
      console.warn("[ordersLocal] listMesasEstado SQLite error:", e);
    }
  }

  // Web fallback: Supabase directly
  let q = supabase.from("mesas_estado").select("*").eq("tenant_id", tenantId);
  if (sucursalId) q = q.eq("sucursal_id", sucursalId);
  const { data } = await q;
  return data || [];
}

export async function saveLocalMesaEstado(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const api = getElectronAPI();
  const row = { ...payload, tenant_id: tenantId };
  if (api?.saveMesaEstado) {
    await api.saveMesaEstado(row);
    return;
  }
  const { error } = await supabase.from("mesas_estado").upsert([row], { onConflict: "id" });
  if (error) console.warn("[ordersLocal] saveLocalMesaEstado web error:", error);
}

export async function readLocalCocinaEstado(
  tenantId: string,
  sucursalId?: string | null
): Promise<Record<string, unknown> | null> {
  const api = getElectronAPI();
  if (api?.listCocinaEstado) {
    try {
      const res = await api.listCocinaEstado({ tenantId, sucursalId: sucursalId || undefined });
      if (res?.ok && Array.isArray(res.data) && res.data[0]) return res.data[0];
    } catch (e) {
      console.warn("[ordersLocal] listCocinaEstado SQLite error:", e);
    }
  }

  let q = supabase.from("cocina_estado").select("*").eq("tenant_id", tenantId);
  if (sucursalId) q = q.eq("sucursal_id", sucursalId);
  const { data } = await q.limit(1);
  return data?.[0] || null;
}

export async function saveLocalCocinaEstado(
  tenantId: string,
  sucursalId: string,
  isOpen: boolean
): Promise<void> {
  const api = getElectronAPI();
  const id = `${tenantId}_${sucursalId}`;
  if (api?.saveMesaEstado) {
    // We can use executeOrdersCommand for kitchen open
    await api.executeOrdersCommand?.({ type: "orders.kitchen.set-open", id, isOpen });
    return;
  }
  await supabase.from("cocina_estado").upsert([{ id, tenant_id: tenantId, sucursal_id: sucursalId, is_open: isOpen }], { onConflict: "id" });
}

export async function readLocalComandas(
  tenantId: string,
  options?: { sucursalId?: string | null; activeOnly?: boolean }
): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  if (api?.listComandas) {
    try {
      const res = await api.listComandas({
        tenantId,
        sucursalId: options?.sucursalId || undefined,
        activeOnly: options?.activeOnly,
      });
      if (res?.ok && Array.isArray(res.data)) {
        return res.data.map((r) => {
          let items = r.items;
          if (typeof items === "string") {
            try { items = JSON.parse(items); } catch { items = []; }
          }
          return { ...r, items: Array.isArray(items) ? items : [] };
        });
      }
    } catch (e) {
      console.warn("[ordersLocal] listComandas SQLite error:", e);
    }
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  let q = supabase.from("comandas").select("*").eq("tenant_id", tenantId).gte("created_at", threeDaysAgo);
  if (options?.sucursalId) q = q.eq("sucursal_id", options.sucursalId);
  if (options?.activeOnly) q = q.in("estado", ["pendiente", "en_preparacion", "listo"]);
  q = q.order("created_at", { ascending: true });
  // Opportunistically clean up cloud comandas older than 3 days
  void Promise.resolve(supabase.from("comandas").delete().eq("tenant_id", tenantId).lt("created_at", threeDaysAgo)).catch(() => {});
  const { data } = await q;
  return (data || []).map((r: any) => ({
    ...r,
    items: Array.isArray(r.items) ? r.items : (typeof r.items === "string" ? JSON.parse(r.items || "[]") : []),
  }));
}

export async function saveLocalComanda(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const api = getElectronAPI();
  const row = { ...payload, tenant_id: tenantId };
  if (api?.saveComanda) {
    await api.saveComanda(row);
    return;
  }
  const { error } = await supabase.from("comandas").upsert([row], { onConflict: "id" });
  if (error) console.warn("[ordersLocal] saveLocalComanda web error:", error);
}

export async function deleteLocalComanda(
  tenantId: string,
  comandaId: string
): Promise<void> {
  const api = getElectronAPI();
  if (api?.deleteComanda) {
    await api.deleteComanda({ tenantId, comandaId });
    return;
  }
  const { error } = await supabase.from("comandas").delete().eq("id", comandaId);
  if (error) console.warn("[ordersLocal] deleteLocalComanda web error:", error);
}

export async function readLocalConsumos(
  tenantId: string,
  options?: { sucursalId?: string | null; comandaId?: string | null; mesaNumero?: number | null; unpaidOnly?: boolean }
): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  if (api?.listConsumos) {
    try {
      const res = await api.listConsumos({
        tenantId,
        sucursalId: options?.sucursalId || undefined,
        comandaId: options?.comandaId || undefined,
        mesaNumero: options?.mesaNumero ?? undefined,
        unpaidOnly: options?.unpaidOnly,
      });
      if (res?.ok && Array.isArray(res.data)) return res.data;
    } catch (e) {
      console.warn("[ordersLocal] listConsumos SQLite error:", e);
    }
  }

  let q = supabase.from("consumos").select("*").eq("tenant_id", tenantId);
  if (options?.sucursalId) q = q.eq("sucursal_id", options.sucursalId);
  if (options?.comandaId) q = q.eq("comanda_id", options.comandaId);
  if (options?.mesaNumero != null) q = q.eq("mesa_numero", options.mesaNumero);
  if (options?.unpaidOnly) q = q.neq("estado", "pagado");
  q = q.order("created_at", { ascending: true });
  const { data } = await q;
  return data || [];
}

export async function saveLocalConsumo(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const api = getElectronAPI();
  const row = { ...payload, tenant_id: tenantId };
  if (api?.saveConsumo) {
    await api.saveConsumo(row);
    return;
  }
  const { error } = await supabase.from("consumos").upsert([row], { onConflict: "id" });
  if (error) console.warn("[ordersLocal] saveLocalConsumo web error:", error);
}

export async function deleteLocalConsumo(
  tenantId: string,
  consumoId: string
): Promise<void> {
  const api = getElectronAPI();
  if (api?.deleteConsumo) {
    await api.deleteConsumo({ tenantId, consumoId });
    return;
  }
  const { error } = await supabase.from("consumos").delete().eq("id", consumoId);
  if (error) console.warn("[ordersLocal] deleteLocalConsumo web error:", error);
}
