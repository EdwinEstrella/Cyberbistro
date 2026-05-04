import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { generateMesasConfig, type MesaConfig } from "../config/mesas";
import { loadCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import { estadoLabels, type MesaEstadoVisual } from "../config/estadoTheme";
import { TableMesaCard } from "./TableMesaCard";

type Estado = MesaEstadoVisual;

interface Mesa extends MesaConfig {
  estado: Estado;
  fusionada: boolean;
  fusion_padre_id: number | null;
  fusion_hijos: number[];
  span_filas: number;
  span_columnas: number;
}

function getAdjacentMesas(mesa: Mesa, allMesas: Mesa[]): Mesa[] {
  const visible = allMesas.filter((m) => !m.fusionada && m.id !== mesa.id);
  return visible.filter((m) => {
    const rightOf = m.fila === mesa.fila && m.columna === mesa.columna + mesa.span_columnas && m.span_filas === mesa.span_filas;
    const leftOf = m.fila === mesa.fila && m.columna + m.span_columnas === mesa.columna && m.span_filas === mesa.span_filas;
    const below = m.columna === mesa.columna && m.fila === mesa.fila + mesa.span_filas && m.span_columnas === mesa.span_columnas;
    const above = m.columna === mesa.columna && m.fila + m.span_filas === mesa.fila && m.span_columnas === mesa.span_columnas;
    return rightOf || leftOf || below || above;
  });
}

const RD = (n: number) => "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function etiquetaEstadoConsumo(estado: string): string {
  switch (estado) {
    case "enviado_cocina": return "En cocina / barra";
    case "listo": return "Listo para servir";
    case "entregado": return "Entregado en mesa";
    case "pedido": return "Pedido";
    default: return estado;
  }
}

interface ConsumoPanelRow {
  id: string;
  nombre: string;
  cantidad: number;
  subtotal: number;
  precio_unitario: number;
  estado: string;
  tipo: string;
  created_at: string;
  comanda_id: string | null;
}

export function Tables() {
  const { tenantId, loading: authLoading } = useAuth();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [deudaPorMesa, setDeudaPorMesa] = useState<Record<number, number>>({});
  const [historialConsumos, setHistorialConsumos] = useState<ConsumoPanelRow[]>([]);
  const navigate = useNavigate();

  const refreshDeudaPorMesa = useCallback(async () => {
    if (!tenantId) { setDeudaPorMesa({}); return; }
    const { data, error } = await insforgeClient.database.from("consumos").select("mesa_numero, subtotal").eq("tenant_id", tenantId).neq("estado", "pagado");
    if (error || !data) { setDeudaPorMesa({}); return; }
    const map: Record<number, number> = {};
    for (const row of data as any[]) {
      const mn = Number(row.mesa_numero);
      if (mn > 0) map[mn] = (map[mn] ?? 0) + Number(row.subtotal);
    }
    setDeudaPorMesa(map);
    setMesas((prev) => prev.map((mesa) => ({ ...mesa, estado: map[mesa.numero] ? "ocupada" : "libre" })));
  }, [tenantId]);

  useEffect(() => {
    setMesas([]);
    if (authLoading || !tenantId) { if (!authLoading) setLoading(false); return; }
    setLoading(true);
    Promise.all([
      insforgeClient.database.from("mesas_estado").select("*").eq("tenant_id", tenantId),
      insforgeClient.database.from("consumos").select("mesa_numero, subtotal").eq("tenant_id", tenantId).neq("estado", "pagado"),
      loadCantidadMesas(tenantId)
    ]).then(([estadosRes, consumosPendRes, cantidadMesas]) => {
      const configArray = generateMesasConfig(cantidadMesas);
      const mesasIniciales = configArray.map((config) => ({ ...config, estado: "libre" as Estado, fusionada: false, fusion_padre_id: null, fusion_hijos: [], span_filas: 1, span_columnas: 1 }));
      const deudaPorNumero = new Map<number, number>();
      if (consumosPendRes.data) {
        for (const row of consumosPendRes.data as any[]) {
          const mn = Number(row.mesa_numero);
          if (mn > 0) deudaPorNumero.set(mn, (deudaPorNumero.get(mn) ?? 0) + Number(row.subtotal));
        }
      }
      if (estadosRes.data && estadosRes.data.length > 0) {
        const estadosMap = new Map<number, any>();
        for (const e of estadosRes.data) estadosMap.set(e.id, e);
        setMesas(mesasIniciales.map((m) => {
          const e = estadosMap.get(m.id);
          return { ...m, estado: deudaPorNumero.has(m.numero) ? "ocupada" : "libre", fusionada: !!e?.fusionada, fusion_padre_id: e?.fusion_padre_id ?? null, fusion_hijos: e?.fusion_hijos ?? [], span_filas: e?.span_filas ?? 1, span_columnas: e?.span_columnas ?? 1 };
        }));
      } else {
        setMesas(mesasIniciales.map((m) => ({ ...m, estado: deudaPorNumero.has(m.numero) ? "ocupada" : "libre" })));
      }
      setLoading(false); refreshDeudaPorMesa();
    });
  }, [authLoading, tenantId, refreshDeudaPorMesa]);

  useEffect(() => {
    if (!tenantId) return;
    const tick = setInterval(() => void refreshDeudaPorMesa(), 20000);
    return () => clearInterval(tick);
  }, [tenantId, refreshDeudaPorMesa]);

  const selectedMesa = useMemo(() => mesas.find(m => m.id === selectedId) ?? null, [mesas, selectedId]);
  const adjacentIds = useMemo(() => selectedMesa ? new Set(getAdjacentMesas(selectedMesa, mesas).map(m => m.id)) : new Set(), [selectedMesa, mesas]);

  useEffect(() => {
    if (!tenantId || !selectedMesa) { setHistorialConsumos([]); return; }
    let cancelled = false;
    async function load() {
      const { data } = await insforgeClient.database.from("consumos").select("*").eq("tenant_id", tenantId).eq("mesa_numero", selectedMesa!.numero).neq("estado", "pagado").order("created_at", { ascending: false });
      if (cancelled || !data) return;
      setHistorialConsumos(data as any[]);
    }
    load();
    const t = setInterval(load, 25000);
    return () => { cancelled = true; clearInterval(t); };
  }, [tenantId, selectedMesa?.numero]);

  async function mergeMesas(parentId: number, childId: number) {
    if (!tenantId) return;
    const parent = mesas.find(m => m.id === parentId)!;
    const child = mesas.find(m => m.id === childId)!;
    const isHorizontal = child.fila === parent.fila && child.columna === parent.columna + parent.span_columnas;
    const isVertical = child.columna === parent.columna && child.fila === parent.fila + parent.span_filas;
    if (!isHorizontal && !isVertical) return;
    const newSpanCols = isHorizontal ? parent.span_columnas + child.span_columnas : parent.span_columnas;
    const newSpanFilas = isVertical ? parent.span_filas + child.span_filas : parent.span_filas;
    const newHijos = [...parent.fusion_hijos, childId];
    await Promise.all([
      insforgeClient.database.from("mesas_estado").upsert({ id: parentId, tenant_id: tenantId, span_columnas: newSpanCols, span_filas: newSpanFilas, fusion_hijos: newHijos }, { onConflict: "tenant_id,id" }),
      insforgeClient.database.from("mesas_estado").upsert({ id: childId, tenant_id: tenantId, fusionada: true, fusion_padre_id: parentId }, { onConflict: "tenant_id,id" }),
    ]);
    setMesas(prev => prev.map(m => m.id === parentId ? { ...m, span_columnas: newSpanCols, span_filas: newSpanFilas, fusion_hijos: newHijos } : (m.id === childId ? { ...m, fusionada: true, fusion_padre_id: parentId } : m)));
    setMergeMode(false);
  }

  async function splitMesa(parentId: number) {
    if (!tenantId) return;
    const parent = mesas.find(m => m.id === parentId)!;
    const childIds = parent.fusion_hijos;
    await Promise.all([
      insforgeClient.database.from("mesas_estado").upsert({ id: parentId, tenant_id: tenantId, span_columnas: 1, span_filas: 1, fusion_hijos: [] }, { onConflict: "tenant_id,id" }),
      ...childIds.map(cid => insforgeClient.database.from("mesas_estado").upsert({ id: cid, tenant_id: tenantId, fusionada: false, fusion_padre_id: null }, { onConflict: "tenant_id,id" })),
    ]);
    setMesas(prev => prev.map(m => m.id === parentId ? { ...m, span_columnas: 1, span_filas: 1, fusion_hijos: [] } : (childIds.includes(m.id) ? { ...m, fusionada: false, fusion_padre_id: null } : m)));
    setSelectedId(null); setMergeMode(false);
  }

  const CELL = 120;
  const GAP = 10;
  const maxFila = useMemo(() => mesas.reduce((acc, m) => Math.max(acc, m.fila), 0), [mesas]);
  const maxColumna = useMemo(() => mesas.reduce((acc, m) => Math.max(acc, m.columna), 0), [mesas]);

  if (authLoading || loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando mesas...</div>;

  return (
    <div className="flex-1 bg-background transition-colors duration-300 flex flex-col min-h-0 overflow-hidden" onClick={e => { if (e.target === e.currentTarget) { setSelectedId(null); setMergeMode(false); } }}>
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 sm:py-6 gap-4 shrink-0 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-4">
          <h1 className="font-['Space_Grotesk'] font-bold text-foreground text-3xl">Plano de Mesas</h1>
          {mergeMode && <div className="bg-primary/10 border border-primary/20 rounded-full px-4 py-1 text-primary text-[10px] font-bold uppercase tracking-widest animate-pulse">Selecciona adyacente para unir</div>}
        </div>
        <div className="flex gap-4">
          <StatusBadge color="#59ee50" label={`${mesas.filter(m => !m.fusionada && m.estado === 'libre').length} Libres`} />
          <StatusBadge color="#ff716c" label={`${mesas.filter(m => !m.fusionada && m.estado === 'ocupada').length} Ocupadas`} />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto flex items-start justify-center p-8 bg-muted/5">
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${maxColumna}, ${CELL}px)`, gridTemplateRows: `repeat(${maxFila}, ${CELL}px)`, gap: `${GAP}px`, position: "relative" }}>
             {Array.from({ length: maxFila * maxColumna }).map((_, i) => (
                <div key={i} className="rounded-lg border border-black/5 dark:border-white/5 pointer-events-none" />
             ))}
             {mesas.filter(m => !m.fusionada).map(mesa => {
                const isSelected = selectedId === mesa.id;
                const deuda = (deudaPorMesa[mesa.numero] ?? 0) + mesa.fusion_hijos.reduce((s, cid) => s + (deudaPorMesa[cid] ?? 0), 0);
                return <TableMesaCard key={mesa.id} mesa={mesa} isSelected={isSelected} isMergeTarget={mergeMode && adjacentIds.has(mesa.id)} deudaTotal={deuda} onClick={m => { if (mergeMode && adjacentIds.has(m.id)) { mergeMesas(selectedId!, m.id); } else { setSelectedId(m.id === selectedId ? null : m.id); setMergeMode(false); } }} formatCurrency={RD} />;
             })}
          </div>
        </div>

        {selectedMesa && (
          <div className="w-[320px] shrink-0 bg-sidebar border-l border-black/10 dark:border-white/10 flex flex-col p-6 gap-6 overflow-y-auto shadow-2xl transition-all duration-300">
             <div className="flex justify-between items-start">
                <div>
                   <h2 className="font-['Space_Grotesk'] font-bold text-foreground text-2xl">Mesa {String(selectedMesa.numero).padStart(2, "0")}</h2>
                   <p className="text-muted-foreground text-[11px] uppercase tracking-widest font-bold">Fila {selectedMesa.fila} · Col {selectedMesa.columna}</p>
                </div>
                <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground text-2xl transition-colors border-none bg-transparent cursor-pointer">×</button>
             </div>

             <div className="h-px bg-black/5 dark:bg-white/5" />

             <div className="space-y-4">
                <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Capacidad</span><span className="text-foreground font-bold">{selectedMesa.capacidad} pax</span></div>
                <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Estado</span><span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full ${selectedMesa.estado === 'libre' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-primary/10 text-primary'}`}>{estadoLabels[selectedMesa.estado]}</span></div>
             </div>

             <div className="flex-1 flex flex-col gap-4 min-h-0 bg-muted/20 rounded-2xl border border-black/5 dark:border-white/5 p-4 overflow-hidden">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pedido en mesa</span>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                   {historialConsumos.length === 0 ? <p className="text-center text-muted-foreground text-xs py-8">Mesa vacía.</p> : historialConsumos.map(row => (
                      <div key={row.id} className="bg-card border border-black/5 dark:border-white/5 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                         <div className="flex justify-between items-start gap-2"><span className="text-foreground font-bold text-[13px] leading-tight">{row.cantidad}× {row.nombre}</span><span className="text-primary font-bold text-[13px] tabular-nums">{RD(Number(row.subtotal))}</span></div>
                         <div className="flex gap-2"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${row.tipo === 'cocina' ? 'bg-orange-500/10 text-orange-500' : 'bg-green-500/10 text-green-500'}`}>{row.tipo}</span><span className="text-[9px] font-bold uppercase text-muted-foreground/60">{etiquetaEstadoConsumo(row.estado)}</span></div>
                      </div>
                   ))}
                </div>
                {historialConsumos.length > 0 && (
                   <button onClick={() => navigate("/dashboard", { state: { selectMesaNumero: selectedMesa.numero } })} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold uppercase text-[11px] tracking-widest shadow-lg hover:opacity-90 transition-all border-none cursor-pointer">Cobrar en POS</button>
                )}
             </div>

             <div className="space-y-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Herramientas</span>
                <button onClick={() => setMergeMode(!mergeMode)} className={`w-full py-3 rounded-xl font-bold uppercase text-[11px] tracking-widest border transition-all cursor-pointer ${mergeMode ? 'bg-primary/20 border-primary text-primary' : 'bg-muted border-border text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5'}`}>{mergeMode ? "Cancelar unión" : "Fusionar mesa"}</button>
                {selectedMesa.fusion_hijos.length > 0 && <button onClick={() => splitMesa(selectedMesa.id)} className="w-full py-3 rounded-xl font-bold uppercase text-[11px] tracking-widest bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all cursor-pointer">Separar mesas</button>}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-black/5 dark:border-white/5 bg-card/50 shadow-sm"><div className="size-2 rounded-full" style={{ backgroundColor: color }} /><span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{label}</span></div>;
}
