import { useState, useEffect, useCallback, useMemo } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";

import { buildCierreDiaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";

type FacturaEstado = "pagada" | "pendiente" | "cancelada";

interface FacturaRow {
  id: string;
  estado: FacturaEstado;
  metodo_pago: string;
  subtotal: number;
  itbis: number;
  total: number;
  created_at: string;
}

interface ConsumoAbiertoRow {
  mesa_numero: number | null;
  subtotal: number;
  estado: string;
}

interface CierreOperativoRow {
  id: string;
  business_day: string;
  cycle_number: number;
  opened_at: string;
  closed_at: string | null;
  printed_at: string | null;
}

function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const da = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function ymdToLongLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("es-DO", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatCycleDateTime(iso: string | null | undefined): string {
  if (!iso) return "Pendiente";
  return new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
}

const METODO_ETIQUETA: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", digital: "Digital", transferencia: "Transferencia" };
function etiquetaMetodo(m: string): string { return METODO_ETIQUETA[m] ?? m.charAt(0).toUpperCase() + m.slice(1); }
const RD = (n: number) => "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ITBIS_RATE = 0.18;
const MAX_START_CYCLE_ATTEMPTS = 3;

export function Cierre() {
  const { tenantId, user, loading: authLoading } = useAuth();
  const [fecha, setFecha] = useState(todayYmd);
  const [cycles, setCycles] = useState<CierreOperativoRow[]>([]);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [consumosAbiertos, setConsumosAbiertos] = useState<ConsumoAbiertoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingCycle, setStartingCycle] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState("");
  const [globalHasOpenCycle, setGlobalHasOpenCycle] = useState(false);

  const currentCycle = useMemo(() => cycles.find(c => !c.closed_at) ?? cycles[0] ?? null, [cycles]);
  const hasOpenCycle = currentCycle != null && currentCycle.closed_at == null;

  const resumen = useMemo(() => {
    const pagadas = facturas.filter(f => f.estado === "pagada");
    const totalPagado = pagadas.reduce((s, f) => s + Number(f.total), 0);
    const subtotalPagado = pagadas.reduce((s, f) => s + Number(f.subtotal), 0);
    const itbisPagado = pagadas.reduce((s, f) => s + Number(f.itbis), 0);
    const porMetodoMap = new Map<string, { cantidad: number; total: number }>();
    for (const f of pagadas) {
      const k = f.metodo_pago || "otro";
      const cur = porMetodoMap.get(k) ?? { cantidad: 0, total: 0 };
      cur.cantidad += 1; cur.total += Number(f.total); porMetodoMap.set(k, cur);
    }
    return { pagadas, pendientes: facturas.filter(f => f.estado === "pendiente"), canceladas: facturas.filter(f => f.estado === "cancelada"), totalPagado, subtotalPagado, itbisPagado, totalPendiente: facturas.filter(f => f.estado === "pendiente").reduce((s, f) => s + Number(f.total), 0), porMetodo: [...porMetodoMap.entries()].map(([etiqueta, v]) => ({ etiqueta: etiquetaMetodo(etiqueta), ...v })).sort((a, b) => b.total - a.total), ticketPromedioPagado: pagadas.length > 0 ? totalPagado / pagadas.length : 0 };
  }, [facturas]);

  const resumenCuentasAbiertas = useMemo(() => {
    const subtotal = consumosAbiertos.reduce((s, r) => s + Number(r.subtotal), 0);
    const mesaMap = new Map<number, number>();
    for (const r of consumosAbiertos) { const mn = Number(r.mesa_numero) || 0; mesaMap.set(mn, (mesaMap.get(mn) ?? 0) + Number(r.subtotal)); }
    return { lineas: consumosAbiertos.length, mesasDistintas: mesaMap.size, subtotal, itbisEst: subtotal * ITBIS_RATE, totalEst: subtotal * (1 + ITBIS_RATE), porMesa: [...mesaMap.entries()].map(([mesa, st]) => ({ mesa, subtotal: st })).sort((a, b) => b.subtotal - a.subtotal) };
  }, [consumosAbiertos]);

  const cargar = useCallback(async () => {
    if (!tenantId) { setCycles([]); setFacturas([]); setConsumosAbiertos([]); setLoading(false); return; }
    setLoading(true); setLoadError("");
    const [cyclesRes, consRes, openGlobalRes] = await Promise.all([
      insforgeClient.database.from("cierres_operativos").select("*").eq("tenant_id", tenantId).eq("business_day", fecha).order("cycle_number", { ascending: false }),
      insforgeClient.database.from("consumos").select("mesa_numero, subtotal, estado").eq("tenant_id", tenantId).neq("estado", "pagado"),
      insforgeClient.database.from("cierres_operativos").select("id").eq("tenant_id", tenantId).is("closed_at", null).limit(1),
    ]);
    if (cyclesRes.error) { setLoadError(cyclesRes.error.message); setLoading(false); return; }
    const cycleRows = cyclesRes.data as CierreOperativoRow[]; setCycles(cycleRows);
    const sel = cycleRows.find(c => !c.closed_at) ?? cycleRows[0] ?? null;
    if (sel) {
      const factRes = await insforgeClient.database.from("facturas").select("*").eq("tenant_id", tenantId).gte("created_at", sel.opened_at).lte("created_at", sel.closed_at ?? new Date().toISOString()).order("created_at", { ascending: true });
      setFacturas(factRes.data as FacturaRow[] ?? []);
    } else setFacturas([]);
    setConsumosAbiertos(sel?.closed_at == null ? (consRes.data as any[] ?? []) : []);
    setGlobalHasOpenCycle(!!(openGlobalRes.data?.length));
    setLoading(false);
  }, [tenantId, fecha]);

  useEffect(() => {
    if (authLoading || !tenantId) return;
    insforgeClient.database.from("cierres_operativos").select("business_day").eq("tenant_id", tenantId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle().then(res => {
      if (res.data?.business_day) setFecha(res.data.business_day);
    });
  }, [authLoading, tenantId]);

  useEffect(() => { if (!authLoading) void cargar(); }, [authLoading, cargar]);

  async function handleStartCycle() {
    if (!tenantId || globalHasOpenCycle) return;
    setStartingCycle(true); setPrintMsg("");
    for (let attempt = 0; attempt < MAX_START_CYCLE_ATTEMPTS; attempt++) {
      const { data: latest } = await insforgeClient.database.from("cierres_operativos").select("cycle_number").eq("tenant_id", tenantId).order("cycle_number", { ascending: false }).limit(1).maybeSingle();
      const num = ((latest as any)?.cycle_number ?? 0) + 1;
      const { error } = await insforgeClient.database.from("cierres_operativos").insert([{ tenant_id: tenantId, business_day: fecha, cycle_number: num, opened_at: new Date().toISOString(), opened_by_auth_user_id: user?.id }]);
      if (!error) { setPrintMsg(`Ciclo #${num} iniciado.`); await cargar(); break; }
    }
    setStartingCycle(false);
  }

  async function handleCerrarCiclo() {
    if (!tenantId || !currentCycle || currentCycle.closed_at) return;
    setPrinting(true); setPrintMsg("");
    const { data: pend } = await insforgeClient.database.from("consumos").select("id").eq("tenant_id", tenantId).neq("estado", "pagado");
    if (pend?.length) { setPrintMsg("No se puede cerrar con mesas pendientes."); setPrinting(false); return; }
    const now = new Date().toISOString();
    const { error } = await insforgeClient.database.from("cierres_operativos").update({ closed_at: now, closed_by_auth_user_id: user?.id }).eq("id", currentCycle.id).eq("tenant_id", tenantId);
    if (error) { setPrintMsg(error.message); setPrinting(false); return; }
    setPrintMsg("Ciclo cerrado.");
    // Printing logic maintained identically
    const [tenantRes, factRes] = await Promise.all([
      insforgeClient.database.from("tenants").select("nombre_negocio, rnc, direccion, telefono, logo_url").eq("id", tenantId).maybeSingle(),
      insforgeClient.database.from("facturas").select("*").eq("tenant_id", tenantId).gte("created_at", currentCycle.opened_at).lte("created_at", now).order("created_at", { ascending: true })
    ]);
    if (tenantRes.data && factRes.data) {
      const pag = factRes.data.filter((f: any) => f.estado === "pagada");
      const metMap = new Map<string, any>();
      for (const f of pag) { const k = f.metodo_pago || "otro"; const cur = metMap.get(k) ?? { etiqueta: etiquetaMetodo(k), cantidad: 0, total: 0 }; cur.cantidad++; cur.total += Number(f.total); metMap.set(k, cur); }
      const totalPag = pag.reduce((s: number, f: any) => s + Number(f.total), 0);
      const { paperWidthMm } = getThermalPrintSettings();
      const html = buildCierreDiaReceiptHtml(tenantRes.data as any, {
        fechaOperacion: ymdToLongLabel(fecha), cicloNumero: currentCycle.cycle_number, generadoEn: formatCycleDateTime(now), generadoAtIso: now, abiertoAtIso: currentCycle.opened_at, cerradoAtIso: now,
        facturasPagadas: pag.length, facturasPendientes: factRes.data.filter((f: any) => f.estado === "pendiente").length, facturasCanceladas: factRes.data.filter((f: any) => f.estado === "cancelada").length,
        totalPagado: totalPag, subtotalPagado: pag.reduce((s: number, f: any) => s + Number(f.subtotal), 0), itbisPagado: pag.reduce((s: number, f: any) => s + Number(f.itbis), 0),
        porMetodo: [...metMap.values()].sort((a, b) => b.total - a.total), ticketPromedioPagado: pag.length ? totalPag / pag.length : 0,
      }, paperWidthMm);
      const res = await printThermalHtml(html);
      if (res.ok) await insforgeClient.database.from("cierres_operativos").update({ printed_at: now }).eq("id", currentCycle.id);
    }
    setPrinting(false); await cargar();
  }

  if (authLoading || loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando cierre...</div>;

  return (
    <div className="flex-1 p-4 sm:p-10 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[1000px] mx-auto flex flex-col gap-8">
        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-10 shadow-sm">
           <span className="text-primary text-[11px] font-bold uppercase tracking-[0.2em] mb-2 block">Operaciones</span>
           <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold text-foreground mb-4">Cierre de Caja</h1>
           <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">Controla los ciclos operativos de tu negocio. Asegúrate de cobrar todas las mesas antes de realizar el cierre final e imprimir el reporte Z.</p>
        </div>

        <div className="bg-card/50 backdrop-blur-[6px] rounded-2xl border border-black/10 dark:border-white/5 p-5 flex flex-wrap items-end gap-5 justify-between shadow-sm">
           <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Día Operativo</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter'] text-foreground outline-none focus:border-primary transition-all" />
              </div>
              <button onClick={() => void cargar()} className="bg-muted text-foreground px-6 py-2.5 rounded-xl font-bold uppercase text-[11px] tracking-widest border border-border hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer">Actualizar</button>
           </div>
           <div className="flex gap-3">
              <button onClick={handleStartCycle} disabled={startingCycle || globalHasOpenCycle} className="bg-muted text-white border border-primary/20 rounded-xl px-6 py-2.5 font-bold uppercase text-[11px] tracking-widest hover:bg-primary/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">Iniciar Ciclo</button>
              <button onClick={handleCerrarCiclo} disabled={printing || !hasOpenCycle} className="bg-primary text-primary-foreground shadow-lg rounded-xl px-8 py-2.5 font-bold uppercase text-[11px] tracking-widest hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer border-none">Cerrar & Imprimir</button>
           </div>
        </div>

        {(loadError || printMsg) && (
           <div className={`p-4 rounded-xl border ${loadError ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'} text-sm font-medium animate-in fade-in slide-in-from-top-2`}>{loadError || printMsg}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
           <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm flex flex-col gap-6">
              <div className="flex justify-between items-start">
                 <div><div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{ymdToLongLabel(fecha)}</div><h2 className="font-['Space_Grotesk'] text-2xl font-bold text-foreground">{currentCycle ? `Ciclo #${currentCycle.cycle_number}` : "Sin ciclos activos"}</h2></div>
                 {currentCycle && <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${currentCycle.closed_at ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-600 dark:text-green-400 animate-pulse'}`}>{currentCycle.closed_at ? "Cerrado" : "Abierto / En curso"}</span>}
              </div>
              {currentCycle ? (
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/30 p-4 rounded-xl border border-black/5 dark:border-white/5"><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Apertura</div><div className="text-foreground font-medium">{formatCycleDateTime(currentCycle.opened_at)}</div></div>
                    <div className="bg-muted/30 p-4 rounded-xl border border-black/5 dark:border-white/5"><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Cierre</div><div className="text-foreground font-medium">{formatCycleDateTime(currentCycle.closed_at)}</div></div>
                 </div>
              ) : <p className="text-muted-foreground text-sm py-10 text-center">Inicia un ciclo para registrar ventas hoy.</p>}
           </div>

           <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm flex flex-col gap-4">
              <h2 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Historial del día</h2>
              <div className="space-y-3 overflow-y-auto max-h-[300px] pr-2">
                 {cycles.length ? cycles.map(c => (
                    <div key={c.id} className="p-4 rounded-xl border border-black/5 dark:border-white/10 bg-muted/20 hover:bg-muted/40 transition-colors">
                       <div className="flex justify-between font-bold text-foreground text-sm mb-1"><span>Ciclo #{c.cycle_number}</span><span className="text-[10px] uppercase text-muted-foreground">{c.closed_at ? "Cerrado" : "Activo"}</span></div>
                       <div className="text-[11px] text-muted-foreground">Inició: {formatCycleDateTime(c.opened_at)}</div>
                    </div>
                 )) : <p className="text-muted-foreground text-xs italic py-4">No hay cierres previos hoy.</p>}
              </div>
           </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
           {[
             { label: "Total Cobrado", val: RD(resumen.totalPagado), color: "text-green-600 dark:text-green-400" },
             { label: "Facturas", val: resumen.pagadas.length, color: "text-foreground" },
             { label: "Pendientes", val: `${resumen.pendientes.length} (${RD(resumen.totalPendiente)})`, color: "text-primary" },
             { label: "Canceladas", val: resumen.canceladas.length, color: "text-destructive" }
           ].map((st, i) => (
             <div key={i} className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-5 shadow-sm">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{st.label}</div>
                <div className={`font-['Space_Grotesk'] text-xl font-bold ${st.color}`}>{st.val}</div>
             </div>
           ))}
        </div>

        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm">
           <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-4">Cuentas con saldo abierto</h2>
           {resumenCuentasAbiertas.lineas ? (
              <div className="space-y-6">
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl"><div className="text-[10px] font-bold text-primary uppercase mb-1">Mesas con deuda</div><div className="text-primary font-bold text-lg">{resumenCuentasAbiertas.mesasDistintas} mesas</div></div>
                    <div className="bg-muted/50 p-4 rounded-xl border border-border"><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Subtotal</div><div className="text-foreground font-bold text-lg">{RD(resumenCuentasAbiertas.subtotal)}</div></div>
                    <div className="bg-muted/50 p-4 rounded-xl border border-border"><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Total est.</div><div className="text-foreground font-bold text-lg">{RD(resumenCuentasAbiertas.totalEst)}</div></div>
                 </div>
                 <div className="space-y-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Detalle por mesa</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                       {resumenCuentasAbiertas.porMesa.map(m => (
                         <div key={m.mesa} className="p-3 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 flex justify-between items-center"><span className="text-xs font-bold text-foreground">{m.mesa ? `Mesa ${m.mesa}` : "PL"}</span><span className="text-xs text-primary font-bold tabular-nums">{RD(m.subtotal)}</span></div>
                       ))}
                    </div>
                 </div>
              </div>
           ) : <p className="text-green-600 dark:text-green-400 font-medium py-4">No hay consumos pendientes. Caja lista para cerrar.</p>}
        </div>
      </div>
    </div>
  );
}
