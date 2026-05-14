import { useState, useEffect, useRef, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useCocinaRealtimeSync } from "../useCocinaRealtimeSync";
import { buildComandaReceiptHtml, type TenantReceiptInfo } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { enqueueLocalWrite, getDeviceId, readLocalMirror, shouldReadLocalFirst, writeLocalMirrorRow } from "../../../shared/lib/localFirst";


interface ComandaItem {
  nombre: string;
  cantidad: number;
  precio: number;
  categoria?: string;
  notas?: string;
}

interface Comanda {
  id: string;
  numero_comanda: number;
  mesa_id: string | null;
  mesa_numero: number | null;
  estado: "pendiente" | "en_preparacion" | "listo" | "entregado";
  items: ComandaItem[];
  notas: string | null;
  creado_por: string | null;
  created_at: string;
}

export function Cocina() {
  const { tenantId, loading: authLoading } = useAuth();
  const [cocinaActiva, setCocinaActiva] = useState(true);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const tenantReceiptRef = useRef<TenantReceiptInfo | null>(null);

  const reloadComandas = useCallback(async () => {
    if (!tenantId) return;
    if (await shouldReadLocalFirst(tenantId, ["comandas"])) {
      const rows = await readLocalMirror<Comanda & { tenant_id?: string }>(tenantId, "comandas");
      setComandas(rows.filter(c => c.tenant_id === tenantId && ["pendiente", "en_preparacion", "listo"].includes(c.estado)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return;
    }
    const { data, error } = await insforgeClient.database
      .from("comandas")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("estado", ["pendiente", "en_preparacion", "listo"])
      .order("created_at", { ascending: true });
    if (!error && data) setComandas(data as Comanda[]);
  }, [tenantId]);

  useCocinaRealtimeSync(tenantId, reloadComandas, setCocinaActiva);

  useEffect(() => {
    if (authLoading || !tenantId) { if (!authLoading) setLoading(false); return; }
    const tid = tenantId;
    let cancelled = false;
    async function load() {
      const [useLocalEstado, useLocalComandas, useLocalTenant] = await Promise.all([
        shouldReadLocalFirst(tid, ["cocina_estado"]),
        shouldReadLocalFirst(tid, ["comandas"]),
        shouldReadLocalFirst(tid, ["tenants"]),
      ]);
      const [estadoRes, comandasRes, tenantRes] = await Promise.all([
        useLocalEstado ? readLocalMirror<any>(tid, "cocina_estado").then(data => ({ data })) : insforgeClient.database.from("cocina_estado").select("*").eq("tenant_id", tid).limit(1),
        useLocalComandas ? readLocalMirror<Comanda & { tenant_id?: string }>(tid, "comandas").then(data => ({ data: data.filter(c => c.tenant_id === tid && ["pendiente", "en_preparacion", "listo"].includes(c.estado)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) })) : insforgeClient.database.from("comandas").select("*").eq("tenant_id", tid).in("estado", ["pendiente", "en_preparacion", "listo"]).order("created_at", { ascending: true }),
        useLocalTenant ? readLocalMirror<any>(tid, "tenants").then(data => ({ data: data.find(t => t.id === tid) ?? null })) : insforgeClient.database.from("tenants").select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda").eq("id", tid).maybeSingle(),
      ]);
      if (cancelled) return;
      if (estadoRes.data?.[0]) setCocinaActiva(estadoRes.data[0].activa);
      if (comandasRes.data) setComandas(comandasRes.data as Comanda[]);
      if (tenantRes.data) {
        const t = tenantRes.data as any;
        tenantReceiptRef.current = { nombre_negocio: t.nombre_negocio, rnc: t.rnc, direccion: t.direccion, telefono: t.telefono, logo_url: t.logo_url, moneda: t.moneda ?? null };
      }
      setLoading(false);
    }
    load(); return () => { cancelled = true; };
  }, [authLoading, tenantId]);

  async function toggleCocina() {
    if (!tenantId) return;
    setToggling(true);
    const newActiva = !cocinaActiva;
    const now = new Date().toISOString();
    const localExisting = (await readLocalMirror<any>(tenantId, "cocina_estado").catch(() => [])).find((row: any) => row.tenant_id === tenantId);
    const rowId = localExisting?.id ?? crypto.randomUUID();
    const payload = { id: rowId, activa: newActiva, changed_at: now, updated_at: now, tenant_id: tenantId };
    try {
      if (!navigator.onLine) throw new Error("offline");
      const { data: existing } = await insforgeClient.database.from("cocina_estado").select("id").eq("tenant_id", tenantId).limit(1);
      const result = existing?.length
        ? await insforgeClient.database.from("cocina_estado").update(payload).eq("id", existing[0].id).select().single()
        : await insforgeClient.database.from("cocina_estado").insert(payload).select().single();
      if (result.error) throw new Error(result.error.message);
      await writeLocalMirrorRow(tenantId, "cocina_estado", result.data as Record<string, unknown>);
    } catch {
      await enqueueLocalWrite({ tenantId, tableName: "cocina_estado", rowId, op: "upsert", payload, deviceId: await getDeviceId() });
    }
    setCocinaActiva(newActiva);
    setToggling(false);
  }

  async function advanceComanda(id: string, nextEstado: Comanda["estado"]) {
    if (!tenantId) return;
    const now = new Date().toISOString();
    const deviceId = await getDeviceId();
    const updateComanda = { estado: nextEstado, updated_at: now };
    try {
      if (!navigator.onLine) throw new Error("offline");
      const result = await insforgeClient.database.from("comandas").update(updateComanda).eq("id", id);
      if (result.error) throw new Error(result.error.message);
      if (nextEstado === "listo") {
        const consumoResult = await insforgeClient.database.from("consumos").update({ estado: "listo", updated_at: now }).eq("comanda_id", id).eq("tenant_id", tenantId).eq("estado", "enviado_cocina");
        if (consumoResult.error) throw new Error(consumoResult.error.message);
      }
    } catch {
      await enqueueLocalWrite({ tenantId, tableName: "comandas", rowId: id, op: "update", payload: updateComanda, deviceId });
      if (nextEstado === "listo") {
        const consumos = await readLocalMirror<any>(tenantId, "consumos");
        await Promise.all(consumos
          .filter((c: any) => c.comanda_id === id && c.tenant_id === tenantId && c.estado === "enviado_cocina")
          .map((c: any) => enqueueLocalWrite({ tenantId, tableName: "consumos", rowId: c.id, op: "update", payload: { estado: "listo", updated_at: now }, deviceId })));
      }
    }
    if (nextEstado === "entregado") setComandas(prev => prev.filter(c => c.id !== id));
    else setComandas(prev => prev.map(c => c.id === id ? { ...c, estado: nextEstado } : c));
  }

  const printComanda = async (comanda: Comanda) => {
    if (!tenantReceiptRef.current) return;
    const { paperWidthMm } = getThermalPrintSettings();
    const html = buildComandaReceiptHtml(tenantReceiptRef.current, comanda as any, paperWidthMm);
    await printThermalHtml(html);
  };

  const columns = [
    { key: "pendiente" as const, title: "Pendientes", color: "#ff906d", next: "en_preparacion" as const, nextLabel: "Mover a preparación" },
    { key: "en_preparacion" as const, title: "En Preparación", color: "#ffd06d", next: "listo" as const, nextLabel: "Listo para entrega" },
    { key: "listo" as const, title: "Listos para entregar", color: "#59ee50", next: "entregado" as const, nextLabel: "Marcar entregado" },
  ];

  if (loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando comandas...</div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 sm:py-6 gap-4 border-b border-black/10 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-['Space_Grotesk'] font-bold text-foreground text-3xl">Cocina</h1>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${cocinaActiva ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
             <div className={`size-2 rounded-full ${cocinaActiva ? 'bg-green-500 animate-pulse' : 'bg-destructive'}`} />
             <span className="text-[10px] font-bold uppercase tracking-widest">{cocinaActiva ? "En Vivo" : "Cerrada"}</span>
          </div>
        </div>
        <button onClick={toggleCocina} disabled={toggling} className={`px-6 py-2.5 rounded-xl font-bold uppercase text-[12px] tracking-widest transition-all cursor-pointer border ${cocinaActiva ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20' : 'bg-green-600 text-white border-transparent hover:bg-green-700'}`}>{toggling ? "..." : (cocinaActiva ? "Cerrar Cocina" : "Abrir Cocina")}</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-8 py-4 sm:py-6 bg-muted/5">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {columns.map(col => {
          const items = comandas.filter(c => c.estado === col.key);
          return (
            <div key={col.key} className="min-w-0 flex flex-col bg-card rounded-[20px] sm:rounded-[24px] border border-black/10 dark:border-white/10 overflow-hidden shadow-sm">
               <div className="px-4 sm:px-6 py-4 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-muted/30">
                  <div className="flex items-center gap-3"><div className="size-2 rounded-full" style={{ backgroundColor: col.color }} /><span className="font-['Space_Grotesk'] font-bold text-foreground uppercase tracking-widest text-[13px]">{col.title}</span></div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
               </div>
               <div className="flex-1 p-3 sm:p-4 flex flex-col gap-4">
                  {items.length === 0 ? <div className="py-20 text-center text-muted-foreground text-xs uppercase tracking-widest">Sin comandas</div> : items.map(c => (
                    <div key={c.id} className="bg-background border border-black/5 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                       <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-muted/10">
                          <span className="font-['Space_Grotesk'] font-bold text-primary text-[14px]">#{String(c.numero_comanda).padStart(4, "0")}</span>
                          <span className="text-[11px] font-bold text-muted-foreground uppercase">{c.mesa_numero ? `Mesa ${c.mesa_numero}` : "Para llevar"}</span>
                       </div>
                       <div className="p-4 space-y-2">
                          {c.items.map((it, i) => (
                             <div key={i} className="flex flex-col gap-0.5"><div className="flex justify-between text-[13px] font-medium text-foreground"><span>{it.cantidad}× {it.nombre}</span></div>{it.notas && <span className="text-[10px] text-muted-foreground/60 italic ml-4">↳ {it.notas}</span>}</div>
                          ))}
                          {c.notas && <div className="mt-2 bg-primary/5 border border-primary/10 rounded-lg p-2.5 text-[11px] text-primary leading-relaxed">{c.notas}</div>}
                       </div>
                       <div className="p-3 border-t border-black/5 dark:border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-card/70">
                          <button type="button" onClick={() => void printComanda(c)} className="min-h-[44px] rounded-xl bg-muted px-3 py-3 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all border border-black/5 dark:border-white/10 cursor-pointer">
                            Imprimir comanda
                          </button>
                          <button type="button" onClick={() => void advanceComanda(c.id, col.next)} className="min-h-[44px] rounded-xl px-3 py-3 text-[11px] font-bold uppercase tracking-widest transition-all border border-transparent cursor-pointer" style={{ backgroundColor: `${col.color}24`, color: col.color }}>
                            {col.nextLabel}
                          </button>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
