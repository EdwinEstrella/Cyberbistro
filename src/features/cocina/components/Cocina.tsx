import { useState, useEffect, useRef, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useCocinaRealtimeSync } from "../useCocinaRealtimeSync";
import { buildComandaReceiptHtml, type TenantReceiptInfo } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";


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
    let cancelled = false;
    async function load() {
      const [estadoRes, comandasRes, tenantRes] = await Promise.all([
        insforgeClient.database.from("cocina_estado").select("*").eq("tenant_id", tenantId).limit(1),
        insforgeClient.database.from("comandas").select("*").eq("tenant_id", tenantId).in("estado", ["pendiente", "en_preparacion", "listo"]).order("created_at", { ascending: true }),
        insforgeClient.database.from("tenants").select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda").eq("id", tenantId).maybeSingle(),
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
    const { data: existing } = await insforgeClient.database.from("cocina_estado").select("id").eq("tenant_id", tenantId).limit(1);
    const payload = { activa: newActiva, changed_at: new Date().toISOString(), tenant_id: tenantId };
    const { error } = existing?.length ? await insforgeClient.database.from("cocina_estado").update(payload).eq("id", existing[0].id) : await insforgeClient.database.from("cocina_estado").insert(payload);
    if (!error) setCocinaActiva(newActiva);
    setToggling(false);
  }

  async function advanceComanda(id: string, nextEstado: Comanda["estado"]) {
    const { error } = await insforgeClient.database.from("comandas").update({ estado: nextEstado }).eq("id", id);
    if (!error) {
      if (nextEstado === "listo" && tenantId) {
        await insforgeClient.database.from("consumos").update({ estado: "listo", updated_at: new Date().toISOString() }).eq("comanda_id", id).eq("tenant_id", tenantId).eq("estado", "enviado_cocina");
      }
      if (nextEstado === "entregado") setComandas(prev => prev.filter(c => c.id !== id));
      else setComandas(prev => prev.map(c => c.id === id ? { ...c, estado: nextEstado } : c));
    }
  }

  const printComanda = async (comanda: Comanda) => {
    if (!tenantReceiptRef.current) return;
    const { paperWidthMm } = getThermalPrintSettings();
    const html = buildComandaReceiptHtml(tenantReceiptRef.current, comanda as any, paperWidthMm);
    await printThermalHtml(html);
  };

  const columns = [
    { key: "pendiente" as const, title: "Pendientes", color: "#ff906d", next: "en_preparacion" as const, nextLabel: "Iniciar" },
    { key: "en_preparacion" as const, title: "En Preparación", color: "#ffd06d", next: "listo" as const, nextLabel: "Listo" },
    { key: "listo" as const, title: "Listos para entregar", color: "#59ee50", next: "entregado" as const, nextLabel: "Entregado" },
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

      <div className="flex-1 overflow-x-auto flex gap-6 px-4 sm:px-8 py-6 bg-muted/5">
        {columns.map(col => {
          const items = comandas.filter(c => c.estado === col.key);
          return (
            <div key={col.key} className="min-w-[300px] flex-1 flex flex-col bg-card rounded-[24px] border border-black/10 dark:border-white/10 overflow-hidden shadow-sm">
               <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-muted/30">
                  <div className="flex items-center gap-3"><div className="size-2 rounded-full" style={{ backgroundColor: col.color }} /><span className="font-['Space_Grotesk'] font-bold text-foreground uppercase tracking-widest text-[13px]">{col.title}</span></div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
               </div>
               <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
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
                       <div className="p-3 border-t border-black/5 dark:border-white/5 flex gap-2">
                          <button onClick={() => void printComanda(c)} className="flex-1 py-2 bg-muted text-muted-foreground rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/10 transition-all border-none cursor-pointer">Imprimir</button>
                          <button onClick={() => advanceComanda(c.id, col.next)} className="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border-none cursor-pointer" style={{ backgroundColor: `${col.color}20`, color: col.color }}>{col.nextLabel}</button>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
