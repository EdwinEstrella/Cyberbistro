import { useState, useEffect, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";


interface MesaConPedido {
  id: string;
  numero: number;
  items: ItemEntrega[];
  total: number;
  pagada: boolean;
  created_at: string;
}

interface ItemEntrega {
  consumo_id: string;
  plato_id: number;
  nombre: string;
  cantidad: number;
  cantidad_entregada: number;
  precio_unitario: number;
  subtotal: number;
  va_a_cocina: boolean;
  comanda_estado?: string;
}

const RD = (n: number) => "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Entregas() {
  const { tenantId, loading: authLoading } = useAuth();
  const [mesasConPedido, setMesasConPedido] = useState<MesaConPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "falta_entregar" | "listo_cobro">("todos");

  const loadEntregas = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    if (!tenantId) { setMesasConPedido([]); if (!soft) setLoading(false); return; }
    if (!soft) setLoading(true);
    const { data: consumos } = await insforgeClient.database.from("consumos").select("*").eq("tenant_id", tenantId).neq("estado", "pagado").order("created_at", { ascending: true });
    if (!consumos?.length) { setMesasConPedido([]); if (!soft) setLoading(false); return; }
    
    const platoIds = [...new Set(consumos.map((c: any) => c.plato_id))];
    const comandaIds = [...new Set(consumos.map((c: any) => c.comanda_id).filter(Boolean))];
    const [platosRes, comandasRes] = await Promise.all([
      platoIds.length > 0 ? insforgeClient.database.from("platos").select("id, va_a_cocina").in("id", platoIds) : Promise.resolve({ data: [] }),
      comandaIds.length > 0 ? insforgeClient.database.from("comandas").select("id, estado").in("id", comandaIds) : Promise.resolve({ data: [] }),
    ]);
    const platoMap = new Map(platosRes.data?.map((p: any) => [p.id, p.va_a_cocina]));
    const comandaEstadoById = new Map(comandasRes.data?.map((c: any) => [c.id, c.estado]));
    const mesasMap = new Map<string, MesaConPedido>();

    for (const row of consumos as any[]) {
      const num = Number(row.mesa_numero) || 0;
      const groupKey = `mesa-${num}`;
      if (!mesasMap.has(groupKey)) mesasMap.set(groupKey, { id: groupKey, numero: num, items: [], total: 0, pagada: false, created_at: row.created_at });
      const mesa = mesasMap.get(groupKey)!;
      const vaACocina = row.tipo === "cocina" && platoMap.get(row.plato_id) !== false;
      mesa.items.push({ consumo_id: row.id, plato_id: row.plato_id, nombre: row.nombre, cantidad: row.cantidad, cantidad_entregada: (!vaACocina || row.estado === "entregado") ? row.cantidad : 0, precio_unitario: Number(row.precio_unitario), subtotal: Number(row.subtotal), va_a_cocina: vaACocina, comanda_estado: row.comanda_id ? comandaEstadoById.get(row.comanda_id) : undefined });
      mesa.total += Number(row.subtotal);
    }
    setMesasConPedido(Array.from(mesasMap.values()).sort((a, b) => (a.numero === 0) ? 1 : (b.numero === 0 ? -1 : a.numero - b.numero)));
    if (!soft) setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (authLoading || !tenantId) { if (!authLoading) setLoading(false); return; }
    loadEntregas();
    const t = setInterval(() => loadEntregas({ soft: true }), 30000);
    return () => clearInterval(t);
  }, [authLoading, tenantId, loadEntregas]);

  async function marcarEntregado(id: string) {
    if (!tenantId) return;
    const { error } = await insforgeClient.database.from("consumos").update({ estado: "entregado", updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
    if (!error) loadEntregas({ soft: true });
  }

  const mesasFiltradas = mesasConPedido.filter(m => {
    const todos = m.items.every(it => it.cantidad_entregada >= it.cantidad || !it.va_a_cocina);
    if (filtroEstado === "falta_entregar") return !todos;
    if (filtroEstado === "listo_cobro") return todos;
    return true;
  });

  if (authLoading || loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando entregas...</div>;

  return (
    <div className="flex-1 bg-background transition-colors duration-300 flex flex-col min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 sm:py-6 gap-4 border-b border-black/10 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-['Space_Grotesk'] font-bold text-foreground text-3xl">Entregas</h1>
          <div className="bg-primary/10 border border-primary/20 rounded-full px-4 py-1 text-primary text-[10px] font-bold uppercase tracking-widest">Cuentas Abiertas</div>
        </div>
        <div className="flex gap-2">
           {["todos", "falta_entregar", "listo_cobro"].map(f => (
              <button key={f} onClick={() => setFiltroEstado(f as any)} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer border-none ${filtroEstado === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5'}`}>{f.replace(/_/g, " ")}</button>
           ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-muted/5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
           {mesasFiltradas.length === 0 ? <div className="col-span-full py-20 text-center text-muted-foreground text-sm uppercase tracking-widest">Sin pedidos pendientes</div> : mesasFiltradas.map(m => {
              const completo = m.items.every(it => it.cantidad_entregada >= it.cantidad || !it.va_a_cocina);
              const itemsCocina = m.items.filter(it => it.va_a_cocina);
              const totalCant = itemsCocina.reduce((s, it) => s + it.cantidad, 0);
              const totalEnt = itemsCocina.reduce((s, it) => s + it.cantidad_entregada, 0);
              const perc = totalCant > 0 ? (totalEnt / totalCant) * 100 : 100;
              return (
                <div key={m.id} className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 overflow-hidden shadow-sm flex flex-col transition-all">
                   <div className="p-6 border-b border-black/5 dark:border-white/5 flex justify-between items-start bg-muted/30">
                      <div className="flex items-center gap-4">
                         <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary">{m.numero ? String(m.numero).padStart(2, "0") : "PL"}</div>
                         <div><div className="text-foreground font-bold font-['Space_Grotesk'] text-lg leading-tight">{m.numero ? `Mesa ${m.numero}` : "Para llevar"}</div><div className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">{m.items.length} items</div></div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${completo ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-primary/10 text-primary animate-pulse'}`}>{completo ? "Listo" : "Pendiente"}</div>
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[160px]">
                      {m.items.map(it => {
                         const ent = it.cantidad_entregada >= it.cantidad || !it.va_a_cocina;
                         return (
                           <div key={it.consumo_id} className={`p-3 rounded-xl border transition-all ${ent ? 'bg-green-500/5 border-green-500/10' : 'bg-muted/50 border-black/5 dark:border-white/10'}`}>
                              <div className="flex justify-between items-start gap-4 mb-2">
                                 <div className="space-y-1"><div className={`text-[13px] font-bold leading-tight ${ent ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>{it.cantidad}× {it.nombre}</div>{!ent && it.comanda_estado && <div className="text-[9px] font-bold uppercase text-primary/80 bg-primary/5 px-2 py-0.5 rounded w-fit">{it.comanda_estado}</div>}</div>
                                 {!ent && it.va_a_cocina && <button onClick={() => marcarEntregado(it.consumo_id)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border-none cursor-pointer hover:bg-green-700 transition-colors">Entregar</button>}
                              </div>
                           </div>
                         );
                      })}
                   </div>
                   {totalCant > 0 && (
                     <div className="px-6 py-4 bg-muted/20 border-t border-black/5 dark:border-white/5 space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest"><span>Progreso</span><span>{Math.round(perc)}%</span></div>
                        <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${perc}%` }} /></div>
                     </div>
                   )}
                   <div className="px-6 py-4 bg-muted/50 border-t border-black/5 dark:border-white/5 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Mesa</span>
                      <span className="text-foreground font-bold font-['Space_Grotesk'] text-lg">{RD(m.total)}</span>
                   </div>
                </div>
              );
           })}
        </div>
      </div>
    </div>
  );
}
