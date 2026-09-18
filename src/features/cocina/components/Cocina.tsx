import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../shared/lib/supabase";
import { useAuth, ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import { useCocinaRealtimeSync } from "../useCocinaRealtimeSync";
import { buildComandaReceiptHtml, type TenantReceiptInfo } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { readLocalCocinaEstado, saveLocalCocinaEstado, readLocalComandas, saveLocalComanda, deleteLocalComanda, readLocalConsumos, saveLocalConsumo } from "../../../shared/lib/ordersLocal";
import { useSucursal } from "../../../app/context/SucursalContext";


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
  updated_at?: string;
}

export function Cocina() {
  const { tenantId, loading: authLoading, tenantAccessValidated } = useAuth();
  const { activeSucursalId } = useSucursal();
  const [cocinaActiva, setCocinaActiva] = useState(true);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const tenantReceiptRef = useRef<TenantReceiptInfo | null>(null);
  const printedRef = useRef<Set<string>>(new Set());

  const reloadComandas = useCallback(async () => {
    if (!tenantId) return;
    if (await shouldReadLocalFirst(tenantId, ["comandas"])) {
      const rows = await readLocalMirror<Comanda & { tenant_id?: string; sucursal_id?: string | null }>(tenantId, "comandas");
      setComandas(rows.filter(c => c.tenant_id === tenantId && c.sucursal_id === activeSucursalId && ["pendiente", "en_preparacion", "listo"].includes(c.estado)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return;
    }
    const { data, error } = await supabase
      .from("comandas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", activeSucursalId)
      .in("estado", ["pendiente", "en_preparacion", "listo"])
      .order("created_at", { ascending: true });
    if (!error && data) setComandas(data as Comanda[]);
  }, [tenantId, activeSucursalId]);

  const handleNewComanda = useCallback(
    async (
      payload: { id: string; tenant_id: string; estado?: string },
      eventType: "INSERT" | "UPDATE"
    ) => {
      if (eventType === "UPDATE" && payload.estado !== "pendiente") {
        return;
      }
      if (!tenantId) return;

      try {
        let comanda: Comanda | null = null;
        if (await shouldReadLocalFirst(tenantId, ["comandas"])) {
          const rows = await readLocalMirror<Comanda & { tenant_id?: string; sucursal_id?: string | null }>(tenantId, "comandas");
          comanda = rows.find(c => c.id === payload.id && c.tenant_id === tenantId) ?? null;
        } else {
          const { data, error } = await supabase
            .from("comandas")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("id", payload.id)
            .maybeSingle();
          if (!error && data) {
            comanda = data as Comanda;
          }
        }

        if (!comanda) return;

        const cSucursalId = (comanda as any).sucursal_id;
        if (cSucursalId && cSucursalId !== activeSucursalId) {
          return;
        }

        const updatedAtTime = new Date(comanda.updated_at || comanda.created_at || new Date()).getTime();
        const dedupKey = `${comanda.id}_${updatedAtTime}`;

        if (printedRef.current.has(dedupKey)) {
          return;
        }
        printedRef.current.add(dedupKey);

        if (tenantReceiptRef.current) {
          const { paperWidthMm } = getThermalPrintSettings();
          const html = buildComandaReceiptHtml(tenantReceiptRef.current, comanda as any, paperWidthMm);
          await printThermalHtml(html, { printType: "kitchen" });
        }
      } catch (err) {
        console.error("[Cocina] Error in auto-print:", err);
      }
    },
    [tenantId, activeSucursalId]
  );

  useCocinaRealtimeSync(tenantId, reloadComandas, setCocinaActiva, handleNewComanda, tenantAccessValidated);

  useEffect(() => {
    if (authLoading || !tenantId) { if (!authLoading) setLoading(false); return; }
    const tid = tenantId;
    let cancelled = false;
    async function load() {
      await ensureAuthSessionFresh();

      const useLocalTenant = await shouldReadLocalFirst(tid, ["tenants"]);
      const [estadoData, comandasData, tenantRes] = await Promise.all([
        readLocalCocinaEstado(tid, activeSucursalId),
        readLocalComandas(tid, { sucursalId: activeSucursalId, activeOnly: true }),
        useLocalTenant ? readLocalMirror<any>(tid, "tenants").then(data => ({ data: data.find(t => t.id === tid) ?? null })) : supabase.from("tenants").select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda, logo_size_px, logo_offset_x, logo_offset_y").eq("id", tid).maybeSingle(),
      ]);
      if (cancelled) return;
      if (estadoData) setCocinaActiva((estadoData as any).is_open === 1 || (estadoData as any).is_open === true || (estadoData as any).activa === true);
      if (comandasData) setComandas(comandasData as unknown as Comanda[]);
      if (tenantRes.data) {
        const t = tenantRes.data as any;
        tenantReceiptRef.current = { nombre_negocio: t.nombre_negocio, rnc: t.rnc, direccion: t.direccion, telefono: t.telefono, logo_url: t.logo_url, moneda: t.moneda ?? null, logo_size_px: t.logo_size_px, logo_offset_x: t.logo_offset_x, logo_offset_y: t.logo_offset_y };
      }
      setLoading(false);
    }
    load(); return () => { cancelled = true; };
  }, [authLoading, tenantId, activeSucursalId]);

  useEffect(() => {
    if (!tenantId) return;
    const tid = tenantId;
    return window.electronAPI?.onLocalDataUpdated?.((updatedTenantId) => {
      if (!updatedTenantId || updatedTenantId === tid) {
        void (async () => {
          const [estadoData, comandasData] = await Promise.all([
            readLocalCocinaEstado(tid, activeSucursalId),
            readLocalComandas(tid, { sucursalId: activeSucursalId, activeOnly: true }),
          ]);
          if (estadoData) setCocinaActiva((estadoData as any).is_open === 1 || (estadoData as any).is_open === true || (estadoData as any).activa === true);
          if (comandasData) setComandas(comandasData as unknown as Comanda[]);
        })();
      }
    });
  }, [tenantId, activeSucursalId]);

  async function toggleCocina() {
    if (!tenantId) return;
    setToggling(true);
    const newActiva = !cocinaActiva;
    await saveLocalCocinaEstado(tenantId, activeSucursalId || "main-process-default", newActiva);
    setCocinaActiva(newActiva);
    setToggling(false);
  }

  async function advanceComanda(id: string, nextEstado: Comanda["estado"]) {
    if (!tenantId) return;
    const now = new Date().toISOString();
    
    if (nextEstado === "entregado") {
      await deleteLocalComanda(tenantId, id);
    } else {
      const existing = comandas.find((c) => c.id === id);
      await saveLocalComanda(tenantId, { ...existing, id, estado: nextEstado, updated_at: now, sucursal_id: activeSucursalId });
    }

    if (nextEstado === "listo") {
      const consumos = await readLocalConsumos(tenantId, { comandaId: id });
      await Promise.all(
        consumos
          .filter((c: any) => c.comanda_id === id)
          .map((c: any) => saveLocalConsumo(tenantId, { ...c, estado: "listo", updated_at: now }))
      );
    }
    if (nextEstado === "entregado") setComandas(prev => prev.filter(c => c.id !== id));
    else setComandas(prev => prev.map(c => c.id === id ? { ...c, estado: nextEstado } : c));
  }

  const printComanda = async (comanda: Comanda) => {
    if (!tenantReceiptRef.current) return;
    const { paperWidthMm } = getThermalPrintSettings();
    const html = buildComandaReceiptHtml(tenantReceiptRef.current, comanda as any, paperWidthMm);
    await printThermalHtml(html, { printType: "kitchen" });
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
