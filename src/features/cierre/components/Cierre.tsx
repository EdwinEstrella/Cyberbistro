import { useState, useEffect, useCallback, useMemo } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import type { TenantReceiptInfo } from "../../../shared/lib/receiptTemplates";
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

interface CycleNumberRow {
  cycle_number: number;
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
  return new Intl.DateTimeFormat("es-DO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatCycleDateTime(iso: string | null | undefined): string {
  if (!iso) return "Pendiente";
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

const METODO_ETIQUETA: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  digital: "Digital",
  transferencia: "Transferencia",
};

function etiquetaMetodo(m: string): string {
  return METODO_ETIQUETA[m] ?? m.charAt(0).toUpperCase() + m.slice(1);
}

const RD = (n: number) =>
  "RD$ " +
  n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ITBIS_RATE = 0.18;
const MAX_START_CYCLE_ATTEMPTS = 3;

function isUniqueCycleNumberError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("duplicate") || normalized.includes("unique");
}

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

  const currentCycle = useMemo(
    () => cycles.find((cycle) => !cycle.closed_at) ?? cycles[0] ?? null,
    [cycles]
  );
  const hasOpenCycle = currentCycle != null && currentCycle.closed_at == null;

  const resumen = useMemo(() => {
    const pagadas = facturas.filter((f) => f.estado === "pagada");
    const pendientes = facturas.filter((f) => f.estado === "pendiente");
    const canceladas = facturas.filter((f) => f.estado === "cancelada");

    const totalPagado = pagadas.reduce((s, f) => s + Number(f.total), 0);
    const subtotalPagado = pagadas.reduce((s, f) => s + Number(f.subtotal), 0);
    const itbisPagado = pagadas.reduce((s, f) => s + Number(f.itbis), 0);
    const totalPendiente = pendientes.reduce((s, f) => s + Number(f.total), 0);

    const porMetodoMap = new Map<string, { cantidad: number; total: number }>();
    for (const f of pagadas) {
      const key = f.metodo_pago || "otro";
      const cur = porMetodoMap.get(key) ?? { cantidad: 0, total: 0 };
      cur.cantidad += 1;
      cur.total += Number(f.total);
      porMetodoMap.set(key, cur);
    }
    const porMetodo = [...porMetodoMap.entries()]
      .map(([metodo, v]) => ({
        etiqueta: etiquetaMetodo(metodo),
        cantidad: v.cantidad,
        total: v.total,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      pagadas,
      pendientes,
      canceladas,
      totalPagado,
      subtotalPagado,
      itbisPagado,
      totalPendiente,
      porMetodo,
      ticketPromedioPagado: pagadas.length > 0 ? totalPagado / pagadas.length : 0,
    };
  }, [facturas]);

  const resumenCuentasAbiertas = useMemo(() => {
    const lineas = consumosAbiertos.length;
    if (lineas === 0) {
      return {
        lineas: 0,
        mesasDistintas: 0,
        subtotal: 0,
        itbisEst: 0,
        totalEst: 0,
        porMesa: [] as { mesa: number; subtotal: number }[],
      };
    }

    const subtotal = consumosAbiertos.reduce((s, r) => s + Number(r.subtotal), 0);
    const itbisEst = subtotal * ITBIS_RATE;
    const totalEst = subtotal + itbisEst;
    const mesaMap = new Map<number, number>();
    for (const r of consumosAbiertos) {
      const mn = Number(r.mesa_numero) || 0;
      mesaMap.set(mn, (mesaMap.get(mn) ?? 0) + Number(r.subtotal));
    }
    const porMesa = [...mesaMap.entries()]
      .map(([mesa, st]) => ({ mesa, subtotal: st }))
      .sort((a, b) => b.subtotal - a.subtotal);

    return {
      lineas,
      mesasDistintas: mesaMap.size,
      subtotal,
      itbisEst,
      totalEst,
      porMesa,
    };
  }, [consumosAbiertos]);

  const fechaLegible = useMemo(() => ymdToLongLabel(fecha), [fecha]);

  const cargar = useCallback(async () => {
    if (!tenantId) {
      setCycles([]);
      setFacturas([]);
      setConsumosAbiertos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    const [cyclesRes, consRes, openGlobalRes] = await Promise.all([
      insforgeClient.database
        .from("cierres_operativos")
        .select("id, business_day, cycle_number, opened_at, closed_at, printed_at")
        .eq("tenant_id", tenantId)
        .eq("business_day", fecha)
        .order("cycle_number", { ascending: false }),
      insforgeClient.database
        .from("consumos")
        .select("mesa_numero, subtotal, estado")
        .eq("tenant_id", tenantId)
        .neq("estado", "pagado"),
      insforgeClient.database
        .from("cierres_operativos")
        .select("id")
        .eq("tenant_id", tenantId)
        .is("closed_at", null)
        .limit(1),
    ]);

    if (cyclesRes.error) {
      setLoadError(cyclesRes.error.message || "No se pudieron cargar los cierres operativos.");
      setCycles([]);
      setFacturas([]);
      setConsumosAbiertos([]);
      setLoading(false);
      return;
    }

    const cycleRows = (cyclesRes.data as CierreOperativoRow[]) ?? [];
    setCycles(cycleRows);

    const selectedCycle = cycleRows.find((c) => !c.closed_at) ?? cycleRows[0] ?? null;

    if (selectedCycle) {
      const factRes = await insforgeClient.database
        .from("facturas")
        .select("id, estado, metodo_pago, subtotal, itbis, total, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", selectedCycle.opened_at)
        .lte("created_at", selectedCycle.closed_at ?? new Date().toISOString())
        .order("created_at", { ascending: true });

      if (factRes.error) {
        setLoadError(factRes.error.message || "No se pudieron cargar las facturas del ciclo.");
        setFacturas([]);
      } else {
        setFacturas((factRes.data as FacturaRow[]) ?? []);
      }
    } else {
      setFacturas([]);
    }

    setConsumosAbiertos(
      selectedCycle?.closed_at == null ? ((consRes.data as ConsumoAbiertoRow[]) ?? []) : []
    );

    setGlobalHasOpenCycle(!!(openGlobalRes.data && openGlobalRes.data.length > 0));

    setLoading(false);
  }, [tenantId, fecha]);

  useEffect(() => {
    if (authLoading || !tenantId) return;
    let cancelled = false;
    insforgeClient.database
      .from("cierres_operativos")
      .select("business_day")
      .eq("tenant_id", tenantId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((res) => {
        if (!cancelled && res.data && res.data.business_day) {
          setFecha(res.data.business_day);
        }
      });
    return () => { cancelled = true; };
  }, [authLoading, tenantId]);

  useEffect(() => {
    if (authLoading) return;
    void cargar();
  }, [authLoading, cargar]);

  async function handleStartCycle() {
    if (!tenantId) return;

    if (globalHasOpenCycle) {
      setPrintMsg("Acción denegada: Ya hay un ciclo operativo abierto. Por normas de seguridad, debes cerrar rigurosamente el ciclo actual antes de iniciar uno nuevo.");
      return;
    }

    setStartingCycle(true);
    setPrintMsg("");

    let cycleStarted = false;
    let errorMessage = "";

    for (let attempt = 0; attempt < MAX_START_CYCLE_ATTEMPTS; attempt += 1) {
      const { data: latestCycleData, error: latestCycleError } = await insforgeClient.database
        .from("cierres_operativos")
        .select("cycle_number")
        .eq("tenant_id", tenantId)
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestCycleError) {
        errorMessage = latestCycleError.message || "No se pudo calcular el siguiente ciclo.";
        break;
      }

      const nextCycleNumber = ((latestCycleData as CycleNumberRow | null)?.cycle_number ?? 0) + 1;
      const { error } = await insforgeClient.database.from("cierres_operativos").insert([
        {
          tenant_id: tenantId,
          business_day: fecha,
          cycle_number: nextCycleNumber,
          opened_at: new Date().toISOString(),
          opened_by_auth_user_id: user?.id ?? null,
        },
      ]);

      if (!error) {
        setPrintMsg(`Ciclo #${nextCycleNumber} iniciado.`);
        await cargar();
        cycleStarted = true;
        break;
      }

      const isRetryable =
        isUniqueCycleNumberError(error.message) &&
        attempt < MAX_START_CYCLE_ATTEMPTS - 1;

      if (!isRetryable) {
        errorMessage = error.message || "No se pudo iniciar el ciclo operativo.";
        break;
      }
    }

    if (!cycleStarted) {
      setPrintMsg(errorMessage || "No se pudo iniciar el ciclo operativo.");
    }

    setStartingCycle(false);
  }

  async function handleCerrarCiclo() {
    if (!tenantId) return;
    if (!currentCycle) {
      setPrintMsg("Debes iniciar un ciclo operativo antes de cerrarlo.");
      return;
    }
    if (currentCycle.closed_at) {
      setPrintMsg("El ciclo mostrado ya fue cerrado. Inicia un nuevo ciclo para continuar.");
      return;
    }

    setPrinting(true);
    setPrintMsg("");

    const closedAtIso = new Date().toISOString();
    const cycleStart = currentCycle.opened_at;
    const cycleEnd = closedAtIso;

    // Verificar si hay mesas con deuda
    const consRes = await insforgeClient.database
      .from("consumos")
      .select("id")
      .eq("tenant_id", tenantId)
      .neq("estado", "pagado");

    if (consRes.error) {
      setPrintMsg(consRes.error.message || "Error verificando cuentas pendientes.");
      setPrinting(false);
      return;
    }
    
    const consumosSnapshot = (consRes.data as any[]) ?? [];
    if (consumosSnapshot.length > 0) {
      setPrintMsg(
        "No se puede cerrar el ciclo mientras existan mesas con deudas pendientes. Cierra o cobra todas las mesas primero."
      );
      setPrinting(false);
      return;
    }

    // CERRAR EL CICLO EN LA BASE DE DATOS PRIMERO
    const { error: closeError } = await insforgeClient.database
      .from("cierres_operativos")
      .update({
        closed_at: closedAtIso,
        closed_by_auth_user_id: user?.id ?? null,
      })
      .eq("id", currentCycle.id)
      .eq("tenant_id", tenantId);

    if (closeError) {
      setPrintMsg(closeError.message || "Error al intentar cerrar el ciclo en la base de datos.");
      setPrinting(false);
      return;
    }

    setPrintMsg("Ciclo cerrado exitosamente. Generando reporte para imprimir...");

    // Cargar datos para el recibo
    const [tenantRes, factRes] = await Promise.all([
      insforgeClient.database
        .from("tenants")
        .select("nombre_negocio, rnc, direccion, telefono, logo_url")
        .eq("id", tenantId)
        .maybeSingle(),
      insforgeClient.database
        .from("facturas")
        .select("id, estado, metodo_pago, subtotal, itbis, total, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", cycleStart)
        .lte("created_at", cycleEnd)
        .order("created_at", { ascending: true })
    ]);

    let printed = false;
    
    if (tenantRes.error || !tenantRes.data || factRes.error) {
      setPrintMsg("Ciclo cerrado, pero hubo un error al cargar los datos para imprimir el recibo.");
    } else {
      const facturasSnapshot = (factRes.data as FacturaRow[]) ?? [];
      const pagadas = facturasSnapshot.filter((f) => f.estado === "pagada");
      const pendientes = facturasSnapshot.filter((f) => f.estado === "pendiente");
      const canceladas = facturasSnapshot.filter((f) => f.estado === "cancelada");
      const totalPagado = pagadas.reduce((s, f) => s + Number(f.total), 0);
      const subtotalPagado = pagadas.reduce((s, f) => s + Number(f.subtotal), 0);
      const itbisPagado = pagadas.reduce((s, f) => s + Number(f.itbis), 0);
      const porMetodoMap = new Map<string, { cantidad: number; total: number }>();
      for (const f of pagadas) {
        const key = f.metodo_pago || "otro";
        const cur = porMetodoMap.get(key) ?? { cantidad: 0, total: 0 };
        cur.cantidad += 1;
        cur.total += Number(f.total);
        porMetodoMap.set(key, cur);
      }
      const porMetodo = [...porMetodoMap.entries()]
        .map(([metodo, v]) => ({
          etiqueta: etiquetaMetodo(metodo),
          cantidad: v.cantidad,
          total: v.total,
        }))
        .sort((a, b) => b.total - a.total);
      const ticketPromedioPagado = pagadas.length > 0 ? totalPagado / pagadas.length : 0;

      const tenant = tenantRes.data;
      const tenantInfo: TenantReceiptInfo = {
        nombre_negocio: tenant.nombre_negocio ?? null,
        rnc: tenant.rnc ?? null,
        direccion: tenant.direccion ?? null,
        telefono: tenant.telefono ?? null,
        logo_url: tenant.logo_url ?? null,
      };

      const { paperWidthMm } = getThermalPrintSettings();
      const html = buildCierreDiaReceiptHtml(
        tenantInfo,
        {
          fechaOperacion: fechaLegible,
          cicloNumero: currentCycle.cycle_number,
          generadoEn: formatCycleDateTime(closedAtIso),
          generadoAtIso: closedAtIso,
          abiertoAtIso: currentCycle.opened_at,
          cerradoAtIso: closedAtIso,
          facturasPagadas: pagadas.length,
          facturasPendientes: pendientes.length,
          facturasCanceladas: canceladas.length,
          totalPagado,
          subtotalPagado,
          itbisPagado,
          porMetodo,
          ticketPromedioPagado,
        },
        paperWidthMm
      );

      const res = await printThermalHtml(html);
      if (res.ok) {
        printed = true;
        // Update printed_at
        await insforgeClient.database
          .from("cierres_operativos")
          .update({ printed_at: closedAtIso })
          .eq("id", currentCycle.id)
          .eq("tenant_id", tenantId);
      } else {
        setPrintMsg("Ciclo cerrado correctamente, pero falló la impresión: " + (res.error || "Error desconocido."));
      }
    }

    if (printed) {
      setPrintMsg("Ciclo cerrado e impreso. Inicia un nuevo ciclo si necesitas seguir operando.");
    }

    setPrinting(false);
    await cargar();
  }

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando sesion...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] text-center max-w-md">
          Tu usuario no esta vinculado a un negocio. El cierre solo incluye datos de tu negocio.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-6 lg:p-[32px] overflow-y-auto flex flex-col gap-6 max-w-[980px] bg-background transition-colors duration-300">
      <div>
        <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[28px]">
          Cierre operativo
        </h1>
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[13px] mt-2 leading-relaxed">
          El cierre trabaja por ciclos operativos. Solo se puede imprimir si no hay mesas con saldo
          pendiente. Al imprimir, el ciclo actual se cierra y el siguiente debe iniciarse
          manualmente.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-wide font-bold">
            Dia operativo
          </span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-muted border border-black dark:border-white/20 rounded-[12px] px-4 py-3 font-['Inter',sans-serif] text-foreground text-[14px] outline-none focus:border-primary transition-colors"
          />
        </label>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={loading}
          className="bg-muted rounded-[12px] border border-black dark:border-white/20 px-5 py-3 font-['Inter',sans-serif] text-foreground text-[13px] font-bold cursor-pointer hover:bg-muted/80 disabled:opacity-50 transition-colors"
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
        <button
          type="button"
          onClick={() => void handleStartCycle()}
          disabled={startingCycle || loading || globalHasOpenCycle}
          title={
            globalHasOpenCycle
              ? `Ya hay un ciclo abierto en esta u otra fecha. Debes buscarlo y cerrarlo primero.`
              : undefined
          }
          className="bg-muted rounded-[12px] border border-black dark:border-white/20 px-5 py-3 font-['Inter',sans-serif] text-primary text-[13px] font-bold cursor-pointer hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {startingCycle ? "Iniciando..." : "Iniciar nuevo ciclo"}
        </button>
        <button
          type="button"
          onClick={() => void handleCerrarCiclo()}
          disabled={printing || loading || !hasOpenCycle}
          className="bg-primary text-primary-foreground rounded-[12px] px-6 py-3 font-['Space_Grotesk',sans-serif] font-bold text-[13px] uppercase tracking-wide cursor-pointer border-none shadow-lg hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {printing ? "Cerrando..." : "Cerrar ciclo"}
        </button>
      </div>

      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-[12px] px-4 py-3">
          <span className="font-['Inter',sans-serif] text-destructive text-[13px] font-medium">{loadError}</span>
        </div>
      )}

      {printMsg && (
        <div className="bg-primary/10 border border-primary/20 rounded-[12px] px-4 py-3">
          <span className="font-['Inter',sans-serif] text-primary text-[13px] font-bold">{printMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <div className="bg-card rounded-[20px] border border-black dark:border-white/10 p-6 shadow-sm">
          <div className="font-['Inter',sans-serif] text-muted-foreground text-[12px] uppercase tracking-wide mb-2 font-bold">
            {fechaLegible}
          </div>
          {currentCycle ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[18px]">
                    Ciclo #{currentCycle.cycle_number}
                  </div>
                  <div className="font-['Inter',sans-serif] text-muted-foreground text-[13px] mt-1 font-medium">
                    {currentCycle.closed_at == null ? "Abierto" : "Cerrado"}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wide font-['Inter',sans-serif] font-bold border ${
                    currentCycle.closed_at == null
                      ? "bg-[#15803d]/10 text-[#15803d] border-[#15803d]/20"
                      : "bg-primary/10 text-primary border-primary/20"
                  }`}
                >
                  {currentCycle.closed_at == null ? "En curso" : "Finalizado"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoRow label="Hora de entrada" value={formatCycleDateTime(currentCycle.opened_at)} />
                <InfoRow label="Hora de salida" value={formatCycleDateTime(currentCycle.closed_at)} />
              </div>
              <p className="font-['Inter',sans-serif] text-muted-foreground text-[12px] leading-relaxed">
                Si el restaurante extiende horario despues de medianoche, este ciclo sigue atado al
                dia operativo seleccionado y no al cambio de fecha calendario.
              </p>
            </div>
          ) : (
            <p className="font-['Inter',sans-serif] text-muted-foreground text-[13px]">
              No hay ciclos registrados para este dia operativo. Inicia uno para comenzar el control
              de cierre.
            </p>
          )}
        </div>

        <div className="bg-card rounded-[20px] border border-black dark:border-white/10 p-6 shadow-sm">
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[16px] mb-4 uppercase tracking-tight">
            Historial del dia
          </h2>
          {cycles.length === 0 ? (
            <p className="font-['Inter',sans-serif] text-muted-foreground text-[13px]">
              Sin ciclos todavia.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 max-h-[260px] overflow-y-auto m-0 p-0 list-none">
              {cycles.map((cycle) => (
                <li
                  key={cycle.id}
                  className="rounded-[14px] border border-black/10 dark:border-white/5 px-4 py-3 bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-['Space_Grotesk',sans-serif] text-foreground text-[15px] font-bold">
                      Ciclo #{cycle.cycle_number}
                    </span>
                    <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-wide font-bold">
                      {cycle.closed_at == null ? "Abierto" : "Cerrado"}
                    </span>
                  </div>
                  <div className="font-['Inter',sans-serif] text-muted-foreground text-[12px] mt-2">
                    Entrada: {formatCycleDateTime(cycle.opened_at)}
                  </div>
                  <div className="font-['Inter',sans-serif] text-muted-foreground text-[12px]">
                    Salida: {formatCycleDateTime(cycle.closed_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total cobrado" value={RD(resumen.totalPagado)} accent="#15803d" />
        <StatCard title="Facturas pagadas" value={String(resumen.pagadas.length)} />
        <StatCard
          title="Pendientes"
          value={`${resumen.pendientes.length} · ${RD(resumen.totalPendiente)}`}
          accent="#d4183d"
        />
        <StatCard title="Canceladas" value={String(resumen.canceladas.length)} accent="#d4183d" />
      </div>

      <div className="bg-card rounded-[20px] border border-primary/20 p-6 shadow-sm">
        <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[16px] mb-1 uppercase tracking-tight">
          Mesas con deuda pendiente
        </h2>
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[12px] mb-4">
          Mientras exista una mesa con saldo abierto, el sistema bloquea la impresion del cierre.
        </p>
        {resumenCuentasAbiertas.lineas === 0 ? (
          <div className="bg-[#15803d]/10 border border-[#15803d]/20 rounded-[12px] px-4 py-3">
            <p className="font-['Inter',sans-serif] text-[#15803d] text-[13px] font-bold m-0 text-center uppercase tracking-wide">
              No hay consumos pendientes. Cierre habilitado.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard
                title="Lineas / mesas"
                value={`${resumenCuentasAbiertas.lineas} · ${resumenCuentasAbiertas.mesasDistintas}`}
                accent="var(--primary)"
              />
              <StatCard title="Subtotal" value={RD(resumenCuentasAbiertas.subtotal)} />
              <StatCard
                title="Total estimado (+18%)"
                value={RD(resumenCuentasAbiertas.totalEst)}
                accent="#d97706"
              />
            </div>
            {resumenCuentasAbiertas.porMesa.length > 0 && (
              <div>
                <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-wide mb-2 font-bold">
                  Por mesa (subtotal)
                </div>
                <ul className="flex flex-col gap-2 max-h-[200px] overflow-y-auto m-0 p-0 list-none">
                  {resumenCuentasAbiertas.porMesa.map(({ mesa, subtotal }) => (
                    <li
                      key={mesa}
                      className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-2 last:border-0"
                    >
                      <span className="font-['Inter',sans-serif] text-foreground text-[14px] font-medium">
                        {mesa === 0 ? "Para llevar" : `Mesa ${mesa}`}
                      </span>
                      <span className="font-['Space_Grotesk',sans-serif] text-primary text-[14px] tabular-nums font-bold">
                        {RD(subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-card rounded-[20px] border border-black dark:border-white/10 p-6 shadow-sm">
        <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[16px] mb-4 uppercase tracking-tight">
          Ventas por metodo de pago
        </h2>
        {resumen.porMetodo.length === 0 ? (
          <p className="font-['Inter',sans-serif] text-muted-foreground text-[13px] text-center py-4 bg-muted/20 rounded-[12px]">
            Sin ventas pagadas en este ciclo.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 m-0 p-0 list-none">
            {resumen.porMetodo.map((m) => (
              <li
                key={m.etiqueta}
                className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-3 last:border-0"
              >
                <span className="font-['Inter',sans-serif] text-foreground text-[14px] font-bold">{m.etiqueta}</span>
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[13px] font-medium">
                  {m.cantidad} fact. · <span className="text-foreground font-bold">{RD(m.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card rounded-[20px] border border-black dark:border-white/10 p-6 shadow-sm">
          <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase mb-2 font-bold">
            Subtotal (pagadas)
          </div>
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[22px]">
            {RD(resumen.subtotalPagado)}
          </div>
        </div>
        <div className="bg-card rounded-[20px] border border-black dark:border-white/10 p-6 shadow-sm">
          <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase mb-2 font-bold">
            ITBIS (pagadas)
          </div>
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[22px]">
            {RD(resumen.itbisPagado)}
          </div>
        </div>
        <div className="bg-card rounded-[20px] border border-black dark:border-white/10 p-6 shadow-sm sm:col-span-2 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase mb-2 font-bold">
              Ticket promedio
            </div>
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-primary text-[24px]">
              {resumen.pagadas.length > 0 ? RD(resumen.ticketPromedioPagado) : "-"}
            </div>
          </div>
          <div className="text-right">
             <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase mb-2 font-bold">Total Ciclo</div>
             <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#15803d] text-[28px]">{RD(resumen.totalPagado)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded-[14px] px-4 py-3 border border-black/5 dark:border-white/10">
      <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-wide mb-1 font-bold">
        {label}
      </div>
      <div className="font-['Inter',sans-serif] text-foreground text-[14px] font-medium">{value}</div>
    </div>
  );
}

function StatCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-card rounded-[16px] p-5 border border-black dark:border-white/10 shadow-sm">
      <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-wide mb-2 font-bold">
        {title}
      </div>
      <div
        className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] sm:text-[22px]"
        style={{ color: accent ?? "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}
