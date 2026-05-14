import { useState, useEffect, useCallback, useMemo } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";

import { buildCierreDiaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { readLocalMirror, enqueueLocalWrite, getDeviceId, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

type FacturaEstado = "pagada" | "pendiente" | "cancelada";

interface FacturaRow {
  id: string;
  estado: FacturaEstado;
  metodo_pago: string;
  subtotal: number;
  itbis: number;
  total: number;
  created_at: string;
  pagada_at: string | null;
}

interface ConsumoAbiertoRow {
  mesa_numero: number | null;
  subtotal: number;
  estado: string;
}

interface GastoRow {
  id: string;
  category_id: string | null;
  cycle_id: string | null;
  descripcion: string;
  proveedor: string | null;
  monto: number;
  fecha_gasto: string;
}

interface GastoCategoriaRow {
  id: string;
  nombre: string;
}

interface CierreOperativoRow {
  id: string;
  business_day: string;
  cycle_number: number;
  opened_at: string;
  closed_at: string | null;
  printed_at: string | null;
  created_at: string;
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


function getCycleStartIso(cycle: Pick<CierreOperativoRow, "opened_at" | "created_at">): string {
  return new Date(cycle.created_at).getTime() < new Date(cycle.opened_at).getTime()
    ? cycle.created_at
    : cycle.opened_at;
}

function getInvoiceCycleIso(invoice: Pick<FacturaRow, "estado" | "created_at" | "pagada_at">): string {
  return invoice.estado === "pagada" && invoice.pagada_at ? invoice.pagada_at : invoice.created_at;
}

function invoiceBelongsToCycle(invoice: FacturaRow, cycle: Pick<CierreOperativoRow, "opened_at" | "created_at" | "closed_at">, endIso = cycle.closed_at ?? new Date().toISOString()): boolean {
  const invoiceCycleAt = new Date(getInvoiceCycleIso(invoice)).getTime();
  return (
    invoiceCycleAt >= new Date(getCycleStartIso(cycle)).getTime() &&
    invoiceCycleAt <= new Date(endIso).getTime()
  );
}

async function getPaidSalesCountForCycle(tenantId: string, cycle: Pick<CierreOperativoRow, "opened_at" | "created_at" | "closed_at">): Promise<number> {
  const { data, error } = await insforgeClient.database
    .from("facturas")
    .select("id, estado, metodo_pago, subtotal, itbis, total, created_at, pagada_at")
    .eq("tenant_id", tenantId)
    .eq("estado", "pagada");

  if (error) throw new Error(error.message);
  return ((data as FacturaRow[] | null) ?? []).filter((invoice) => invoiceBelongsToCycle(invoice, cycle)).length;
}

async function discardLatestEmptyCycle(tenantId: string): Promise<boolean> {
  const { data, error } = await insforgeClient.database
    .from("cierres_operativos")
    .select("id, business_day, cycle_number, opened_at, closed_at, printed_at, created_at")
    .eq("tenant_id", tenantId)
    .order("cycle_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return false;

  const cycle = data as CierreOperativoRow;
  const paidSalesCount = await getPaidSalesCountForCycle(tenantId, cycle);
  if (paidSalesCount > 0) return false;

  const { error: deleteError } = await insforgeClient.database
    .from("cierres_operativos")
    .delete()
    .eq("id", cycle.id)
    .eq("tenant_id", tenantId);

  if (deleteError) throw new Error(deleteError.message);
  return true;
}

export function Cierre() {
  const { tenantId, user, loading: authLoading } = useAuth();
  const [fecha, setFecha] = useState(todayYmd);
  const [cycles, setCycles] = useState<CierreOperativoRow[]>([]);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [gastoCategorias, setGastoCategorias] = useState<GastoCategoriaRow[]>([]);
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
    return { pagadas, pendientes: facturas.filter(f => f.estado === "pendiente"), totalPagado, subtotalPagado, itbisPagado, totalPendiente: facturas.filter(f => f.estado === "pendiente").reduce((s, f) => s + Number(f.total), 0), porMetodo: [...porMetodoMap.entries()].map(([etiqueta, v]) => ({ etiqueta: etiquetaMetodo(etiqueta), ...v })).sort((a, b) => b.total - a.total), ticketPromedioPagado: pagadas.length > 0 ? totalPagado / pagadas.length : 0 };
  }, [facturas]);

  const resumenCuentasAbiertas = useMemo(() => {
    const subtotal = consumosAbiertos.reduce((s, r) => s + Number(r.subtotal), 0);
    const mesaMap = new Map<number, number>();
    for (const r of consumosAbiertos) { const mn = Number(r.mesa_numero) || 0; mesaMap.set(mn, (mesaMap.get(mn) ?? 0) + Number(r.subtotal)); }
    return { lineas: consumosAbiertos.length, mesasDistintas: mesaMap.size, subtotal, itbisEst: subtotal * ITBIS_RATE, totalEst: subtotal * (1 + ITBIS_RATE), porMesa: [...mesaMap.entries()].map(([mesa, st]) => ({ mesa, subtotal: st })).sort((a, b) => b.subtotal - a.subtotal) };
  }, [consumosAbiertos]);

  const categoriaGastoPorId = useMemo(() => new Map(gastoCategorias.map((cat) => [cat.id, cat.nombre])), [gastoCategorias]);

  const resumenGastos = useMemo(() => {
    const total = gastos.reduce((s, gasto) => s + Number(gasto.monto), 0);
    const porCategoriaMap = new Map<string, { etiqueta: string; cantidad: number; total: number }>();
    for (const gasto of gastos) {
      const etiqueta = gasto.category_id ? categoriaGastoPorId.get(gasto.category_id) ?? "Sin categoría" : "Sin categoría";
      const cur = porCategoriaMap.get(etiqueta) ?? { etiqueta, cantidad: 0, total: 0 };
      cur.cantidad += 1;
      cur.total += Number(gasto.monto);
      porCategoriaMap.set(etiqueta, cur);
    }
    return {
      total,
      cantidad: gastos.length,
      neto: resumen.totalPagado - total,
      porCategoria: [...porCategoriaMap.values()].sort((a, b) => b.total - a.total),
    };
  }, [gastos, categoriaGastoPorId, resumen.totalPagado]);

  const cargar = useCallback(async () => {
    if (!tenantId) { setCycles([]); setFacturas([]); setGastos([]); setGastoCategorias([]); setConsumosAbiertos([]); setLoading(false); return; }
    setLoading(true); setLoadError("");
    try {
      const [useLocalCiclos, useLocalConsumos, useLocalCategorias] = await Promise.all([
        shouldReadLocalFirst(tenantId, ["cierres_operativos"]),
        shouldReadLocalFirst(tenantId, ["consumos"]),
        shouldReadLocalFirst(tenantId, ["gasto_categorias"]),
      ]);

      const [cyclesAll, consAll, openGlobal, categoriasData] = await Promise.all([
        useLocalCiclos
          ? readLocalMirror<CierreOperativoRow>(tenantId, "cierres_operativos")
          : insforgeClient.database.from("cierres_operativos").select("*").eq("tenant_id", tenantId).eq("business_day", fecha).order("cycle_number", { ascending: false }).then(r => ({ data: r.data, error: r.error })),
        useLocalConsumos
          ? readLocalMirror<ConsumoAbiertoRow>(tenantId, "consumos")
          : insforgeClient.database.from("consumos").select("mesa_numero, subtotal, estado").eq("tenant_id", tenantId).neq("estado", "pagado").then(r => ({ data: r.data, error: r.error })),
        useLocalCiclos
          ? readLocalMirror<CierreOperativoRow>(tenantId, "cierres_operativos")
          : insforgeClient.database.from("cierres_operativos").select("id").eq("tenant_id", tenantId).is("closed_at", null).limit(1).then(r => ({ data: r.data, error: r.error })),
        useLocalCategorias
          ? readLocalMirror<GastoCategoriaRow>(tenantId, "gasto_categorias")
          : insforgeClient.database.from("gasto_categorias").select("id, nombre").eq("tenant_id", tenantId).then(r => ({ data: r.data, error: r.error })),
      ]);

      if (!useLocalCiclos && (cyclesAll as any).error) { setLoadError((cyclesAll as any).error.message); setLoading(false); return; }
      if (!useLocalCategorias && (categoriasData as any).error) { setLoadError((categoriasData as any).error.message); setLoading(false); return; }

      const cycleRowsArray = (useLocalCiclos ? cyclesAll : (cyclesAll as any).data ?? []) as CierreOperativoRow[];
      const openGlobalArray = (useLocalCiclos ? openGlobal : (openGlobal as any).data ?? []) as CierreOperativoRow[];
      const consAllArray = (useLocalConsumos ? consAll : (consAll as any).data ?? []) as ConsumoAbiertoRow[];
      const categoriasArray = (useLocalCategorias ? categoriasData : (categoriasData as any).data ?? []) as GastoCategoriaRow[];

      const cycleRows = cycleRowsArray.filter(c => c.business_day === fecha).sort((a, b) => b.cycle_number - a.cycle_number);
      setCycles(cycleRows);
      setGastoCategorias(categoriasArray);

      const openCycle = openGlobalArray.find(c => !c.closed_at) ?? null;
      const sel = openCycle ?? cycleRows[0] ?? null;

      if (sel) {
        const [factData, gastosData] = await Promise.all([
          shouldReadLocalFirst(tenantId, ["facturas"]).then(useLocal => useLocal
            ? readLocalMirror<FacturaRow>(tenantId, "facturas")
            : insforgeClient.database.from("facturas").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).then(r => r.data ?? [])),
          shouldReadLocalFirst(tenantId, ["gastos"]).then(useLocal => useLocal
            ? readLocalMirror<GastoRow>(tenantId, "gastos").then(gs => gs.filter(g => g.cycle_id === sel.id))
            : insforgeClient.database.from("gastos").select("id, category_id, cycle_id, descripcion, proveedor, monto, fecha_gasto").eq("tenant_id", tenantId).eq("cycle_id", sel.id).order("fecha_gasto", { ascending: true }).then(r => r.data ?? [])),
        ]);

        const allFacturas = (factData as FacturaRow[] | null) ?? [];
        setFacturas(allFacturas.filter((invoice) => invoiceBelongsToCycle(invoice, sel)));
        setGastos((gastosData as GastoRow[]) ?? []);
      } else {
        setFacturas([]);
        setGastos([]);
      }

      const consumosAbiertosData = consAllArray;
      setConsumosAbiertos(sel?.closed_at == null ? consumosAbiertosData.filter(c => c.estado !== "pagado") : []);
      setGlobalHasOpenCycle(!!openCycle);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error cargando datos");
    }
    setLoading(false);
  }, [tenantId, fecha]);

  useEffect(() => {
    if (authLoading || !tenantId) return;
    shouldReadLocalFirst(tenantId, ["cierres_operativos"]).then(useLocal => {
      if (useLocal) {
        return readLocalMirror<CierreOperativoRow>(tenantId, "cierres_operativos");
      }
      return insforgeClient.database.from("cierres_operativos").select("business_day").eq("tenant_id", tenantId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle().then(r => r.data ? [r.data] : []);
    }).then((rows: any) => {
      if (rows?.[0]?.business_day) setFecha(rows[0].business_day);
    }).catch(() => {});
  }, [authLoading, tenantId]);

  useEffect(() => { if (!authLoading) void cargar(); }, [authLoading, cargar]);

  async function handleStartCycle() {
    if (!tenantId || globalHasOpenCycle) return;
    setStartingCycle(true); setPrintMsg("");
    try {
      const useLocalCiclos = await shouldReadLocalFirst(tenantId, ["cierres_operativos"]);

      let discardedLatest = false;
      if (useLocalCiclos) {
        const allCycles = await readLocalMirror<CierreOperativoRow>(tenantId, "cierres_operativos");
        const latestEmpty = allCycles.filter(c => !c.closed_at);
        if (latestEmpty.length > 0) {
          const firstEmpty = latestEmpty[latestEmpty.length - 1];
          await enqueueLocalWrite({ tenantId, tableName: "cierres_operativos", rowId: firstEmpty.id, op: "delete", deviceId: await getDeviceId() });
          discardedLatest = true;
        }
      } else {
        discardedLatest = await discardLatestEmptyCycle(tenantId);
      }

      let num = 1;
      if (useLocalCiclos) {
        const allCycles = await readLocalMirror<CierreOperativoRow>(tenantId, "cierres_operativos");
        const maxNum = allCycles.reduce((m, c) => Math.max(m, c.cycle_number), 0);
        num = maxNum + 1;
      } else {
        const { data: latest } = await insforgeClient.database.from("cierres_operativos").select("cycle_number").eq("tenant_id", tenantId).order("cycle_number", { ascending: false }).limit(1).maybeSingle();
        num = ((latest as any)?.cycle_number ?? 0) + 1;
      }

      const localCycleId = crypto.randomUUID();
      await enqueueLocalWrite({
        tenantId,
        tableName: "cierres_operativos",
        rowId: localCycleId,
        op: "insert",
        payload: { id: localCycleId, tenant_id: tenantId, business_day: fecha, cycle_number: num, opened_by_auth_user_id: user?.id, opened_at: new Date().toISOString(), created_at: new Date().toISOString(), closed_at: null },
        deviceId: await getDeviceId(),
      });

      setPrintMsg(discardedLatest ? `Se descartó el último ciclo sin ventas. Ciclo #${num} iniciado.` : `Ciclo #${num} iniciado.`);
      await cargar();
    } catch (error) {
      setPrintMsg(error instanceof Error ? error.message : "No se pudo iniciar el ciclo.");
    }
    setStartingCycle(false);
  }

  async function handleCerrarCiclo() {
    if (!tenantId || !currentCycle || currentCycle.closed_at) return;
    setPrinting(true); setPrintMsg("");

    const useLocalConsumos = await shouldReadLocalFirst(tenantId, ["consumos"]);
    const useLocalFacturas = await shouldReadLocalFirst(tenantId, ["facturas"]);
    const useLocalGastos = await shouldReadLocalFirst(tenantId, ["gastos"]);
    const useLocalTenants = await shouldReadLocalFirst(tenantId, ["tenants"]);

    let pend: any[] = [];
    if (useLocalConsumos) {
      const allConsumos = await readLocalMirror<ConsumoAbiertoRow>(tenantId, "consumos");
      pend = allConsumos.filter(c => c.estado !== "pagado");
    } else {
      const res = await insforgeClient.database.from("consumos").select("id").eq("tenant_id", tenantId).neq("estado", "pagado");
      pend = res.data ?? [];
    }

    if (pend.length) { setPrintMsg("No se puede cerrar con mesas pendientes."); setPrinting(false); return; }
    const now = new Date().toISOString();

      const [facturasAll, gastosAll] = await Promise.all([
      useLocalFacturas
        ? readLocalMirror<FacturaRow>(tenantId, "facturas")
        : insforgeClient.database.from("facturas").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).then(r => r.data ?? []),
      useLocalGastos
        ? readLocalMirror<GastoRow>(tenantId, "gastos").then(gs => gs.filter(g => g.cycle_id === currentCycle.id))
        : insforgeClient.database.from("gastos").select("id, category_id, cycle_id, descripcion, proveedor, monto, fecha_gasto").eq("tenant_id", tenantId).eq("cycle_id", currentCycle.id).order("fecha_gasto", { ascending: true }).then(r => r.data ?? []),
    ]);

    const facturasCiclo = ((facturasAll as FacturaRow[]) ?? []).filter((invoice) => invoiceBelongsToCycle(invoice, currentCycle, now));
    const gastosCiclo = (gastosAll as GastoRow[]) ?? [];
    const totalGastosCiclo = gastosCiclo.reduce((s, gasto) => s + Number(gasto.monto), 0);
    const pag = facturasCiclo.filter((f: any) => f.estado === "pagada");

    const deviceId = await getDeviceId();

    if (pag.length === 0) {
      await enqueueLocalWrite({ tenantId, tableName: "cierres_operativos", rowId: currentCycle.id, op: "delete", deviceId });
      setPrintMsg(`Ciclo #${currentCycle.cycle_number} descartado porque no tuvo ventas. Puedes iniciarlo de nuevo.`);
      setPrinting(false);
      await cargar();
      return;
    }

    await enqueueLocalWrite({ tenantId, tableName: "cierres_operativos", rowId: currentCycle.id, op: "update", payload: { closed_at: now, closed_by_auth_user_id: user?.id }, deviceId });
    setPrintMsg("Ciclo cerrado.");

    let tenantData: any = null;
    if (useLocalTenants) {
      const allTenants = await readLocalMirror<any>(tenantId, "tenants");
      tenantData = allTenants.find((t: any) => t.id === tenantId) ?? null;
    } else {
      const tenantRes = await insforgeClient.database.from("tenants").select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y").eq("id", tenantId).maybeSingle();
      tenantData = tenantRes.data;
    }

    if (tenantData) {
      const metMap = new Map<string, any>();
      for (const f of pag) { const k = f.metodo_pago || "otro"; const cur = metMap.get(k) ?? { etiqueta: etiquetaMetodo(k), cantidad: 0, total: 0 }; cur.cantidad++; cur.total += Number(f.total); metMap.set(k, cur); }
      const totalPag = pag.reduce((s: number, f: any) => s + Number(f.total), 0);
      const { paperWidthMm } = getThermalPrintSettings();
      const html = buildCierreDiaReceiptHtml(tenantData as any, {
        fechaOperacion: ymdToLongLabel(fecha), cicloNumero: currentCycle.cycle_number, generadoEn: formatCycleDateTime(now), generadoAtIso: now, abiertoAtIso: getCycleStartIso(currentCycle), cerradoAtIso: now,
        facturasPagadas: pag.length, facturasPendientes: facturasCiclo.filter((f: any) => f.estado === "pendiente").length,
        totalPagado: totalPag, subtotalPagado: pag.reduce((s: number, f: any) => s + Number(f.subtotal), 0), itbisPagado: pag.reduce((s: number, f: any) => s + Number(f.itbis), 0),
        porMetodo: [...metMap.values()].sort((a, b) => b.total - a.total), ticketPromedioPagado: pag.length ? totalPag / pag.length : 0,
        gastosTotal: totalGastosCiclo, gastosCantidad: gastosCiclo.length, netoOperativo: totalPag - totalGastosCiclo,
      }, paperWidthMm);
      const res = await printThermalHtml(html);
      if (res.ok) await enqueueLocalWrite({ tenantId, tableName: "cierres_operativos", rowId: currentCycle.id, op: "update", payload: { printed_at: now }, deviceId });
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
             { label: "Gastos", val: RD(resumenGastos.total), color: "text-primary" },
             { label: "Neto", val: RD(resumenGastos.neto), color: resumenGastos.neto >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive" }
           ].map((st, i) => (
             <div key={i} className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-5 shadow-sm">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{st.label}</div>
                <div className={`font-['Space_Grotesk'] text-xl font-bold ${st.color}`}>{st.val}</div>
             </div>
           ))}
        </div>

        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm">
           <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-4">Gastos del ciclo</h2>
           {resumenGastos.cantidad ? (
             <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl"><div className="text-[10px] font-bold text-primary uppercase mb-1">Total gastos</div><div className="text-primary font-bold text-lg">{RD(resumenGastos.total)}</div></div>
                 <div className="bg-muted/50 p-4 rounded-xl border border-border"><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Registros</div><div className="text-foreground font-bold text-lg">{resumenGastos.cantidad}</div></div>
                 <div className="bg-muted/50 p-4 rounded-xl border border-border"><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Neto operativo</div><div className={`font-bold text-lg ${resumenGastos.neto >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{RD(resumenGastos.neto)}</div></div>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 {resumenGastos.porCategoria.map(cat => (
                   <div key={cat.etiqueta} className="p-3 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 flex justify-between items-center">
                     <span className="text-xs font-bold text-foreground">{cat.etiqueta} · {cat.cantidad}</span>
                     <span className="text-xs text-primary font-bold tabular-nums">{RD(cat.total)}</span>
                   </div>
                 ))}
               </div>
             </div>
           ) : <p className="text-muted-foreground font-medium py-4">No hay gastos registrados para este ciclo.</p>}
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
