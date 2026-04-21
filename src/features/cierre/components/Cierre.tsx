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

function buildCycleWindow(cycle: CierreOperativoRow | null): { start: string; end: string } | null {
  if (!cycle) return null;
  return {
    start: cycle.opened_at,
    end: cycle.closed_at ?? new Date().toISOString(),
  };
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
      ticketPromedioPagado:
        pagadas.length > 0 ? totalPagado / pagadas.length : 0,
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

    const cyclesRes = await insforgeClient.database
      .from("cierres_operativos")
      .select("id, business_day, cycle_number, opened_at, closed_at, printed_at")
      .eq("tenant_id", tenantId)
      .eq("business_day", fecha)
      .order("cycle_number", { ascending: false });

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

    const selectedCycle = cycleRows.find((cycle) => !cycle.closed_at) ?? cycleRows[0] ?? null;
    const cycleWindow = buildCycleWindow(selectedCycle);

    if (!cycleWindow) {
      setFacturas([]);
      setConsumosAbiertos([]);
      setLoading(false);
      return;
    }

    const factPromise = insforgeClient.database
      .from("facturas")
      .select("id, estado, metodo_pago, subtotal, itbis, total, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", cycleWindow.start)
      .lte("created_at", cycleWindow.end)
      .order("created_at", { ascending: true });

    const consPromise =
      selectedCycle?.closed_at == null
        ? insforgeClient.database
            .from("consumos")
            .select("mesa_numero, subtotal, estado")
            .eq("tenant_id", tenantId)
            .neq("estado", "pagado")
        : Promise.resolve({ data: [], error: null });

    const [factRes, consRes] = await Promise.all([factPromise, consPromise]);

    if (factRes.error) {
      setLoadError(factRes.error.message || "No se pudieron cargar las facturas del ciclo.");
      setFacturas([]);
    } else {
      setFacturas((factRes.data as FacturaRow[]) ?? []);
    }

    if (consRes.error) {
      setConsumosAbiertos([]);
    } else {
      setConsumosAbiertos((consRes.data as ConsumoAbiertoRow[]) ?? []);
    }

    setLoading(false);
  }, [tenantId, fecha]);

  useEffect(() => {
    if (authLoading) return;
    void cargar();
  }, [authLoading, cargar]);

  async function handleStartCycle() {
    if (!tenantId) return;
    if (hasOpenCycle) {
      setPrintMsg("Ya existe un ciclo abierto para este día operativo.");
      return;
    }

    setStartingCycle(true);
    setPrintMsg("");

    const nextCycleNumber = (cycles[0]?.cycle_number ?? 0) + 1;
    const { error } = await insforgeClient.database.from("cierres_operativos").insert([
      {
        tenant_id: tenantId,
        business_day: fecha,
        cycle_number: nextCycleNumber,
        opened_at: new Date().toISOString(),
        opened_by_auth_user_id: user?.id ?? null,
      },
    ]);

    if (error) {
      setPrintMsg(error.message || "No se pudo iniciar el ciclo operativo.");
    } else {
      setPrintMsg(`Ciclo #${nextCycleNumber} iniciado.`);
      await cargar();
    }

    setStartingCycle(false);
  }

  async function handleImprimir() {
    // Refresh data to ensure latest sales are included in the closure report
    await cargar();
    if (!tenantId) return;
    if (!currentCycle) {
      setPrintMsg("Debes iniciar un ciclo operativo antes de imprimir el cierre.");
      return;
    }
    if (currentCycle.closed_at) {
      setPrintMsg("El ciclo mostrado ya fue cerrado. Iniciá un nuevo ciclo para continuar.");
      return;
    }
    if (resumenCuentasAbiertas.lineas > 0) {
      setPrintMsg(
        "No se puede imprimir el cierre mientras existan mesas con deudas pendientes. Cerrá o cobrá todas las mesas primero."
      );
      return;
    }

    setPrinting(true);
    setPrintMsg("");

    const { data: tenant, error: tErr } = await insforgeClient.database
      .from("tenants")
      .select("nombre_negocio, rnc, direccion, telefono, logo_url")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) {
      setPrintMsg("No se pudo cargar los datos del negocio.");
      setPrinting(false);
      return;
    }

    const tenantInfo: TenantReceiptInfo = {
      nombre_negocio: tenant.nombre_negocio ?? null,
      rnc: tenant.rnc ?? null,
      direccion: tenant.direccion ?? null,
      telefono: tenant.telefono ?? null,
      logo_url: tenant.logo_url ?? null,
    };

    const closedAtIso = new Date().toISOString();
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
        facturasPagadas: resumen.pagadas.length,
        facturasPendientes: resumen.pendientes.length,
        facturasCanceladas: resumen.canceladas.length,
        totalPagado: resumen.totalPagado,
        subtotalPagado: resumen.subtotalPagado,
        itbisPagado: resumen.itbisPagado,
        porMetodo: resumen.porMetodo,
        ticketPromedioPagado: resumen.ticketPromedioPagado,
      },
      paperWidthMm
    );

    const res = await printThermalHtml(html);
    if (!res.ok) {
      setPrintMsg(res.error || "Error al enviar a la impresora.");
      setPrinting(false);
      return;
    }

    const { error: closeError } = await insforgeClient.database
      .from("cierres_operativos")
      .update({
        closed_at: closedAtIso,
        printed_at: closedAtIso,
        closed_by_auth_user_id: user?.id ?? null,
      })
      .eq("id", currentCycle.id)
      .eq("tenant_id", tenantId);

    if (closeError) {
      setPrintMsg(
        closeError.message ||
          "Se imprimió el cierre, pero no se pudo registrar el cierre del ciclo."
      );
      setPrinting(false);
      await cargar();
      return;
    }

    const nextCycleNumber = currentCycle.cycle_number + 1;
    const { error: nextCycleError } = await insforgeClient.database.from("cierres_operativos").insert([
      {
        tenant_id: tenantId,
        business_day: currentCycle.business_day,
        cycle_number: nextCycleNumber,
        opened_at: closedAtIso,
        opened_by_auth_user_id: user?.id ?? null,
      },
    ]);

    if (nextCycleError) {
      setPrintMsg(
        nextCycleError.message ||
          "El cierre se imprimió, pero no se pudo abrir el nuevo ciclo automáticamente."
      );
    } else {
      setPrintMsg(`Cierre impreso. Se abrió automáticamente el ciclo #${nextCycleNumber}.`);
    }

    setPrinting(false);
    await cargar();
  }

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando sesión...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] text-center max-w-md">
          Tu usuario no está vinculado a un negocio. El cierre solo incluye datos de tu negocio.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-6 lg:p-[32px] overflow-y-auto flex flex-col gap-6 max-w-[980px]">
      <div>
        <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
          Cierre operativo
        </h1>
        <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px] mt-2">
          El cierre ahora trabaja por ciclos operativos. Solo se puede imprimir si no hay mesas con
          saldo pendiente, y al imprimir se abre automáticamente un nuevo ciclo para el mismo día
          operativo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-wide">
            Día operativo
          </span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[12px] px-4 py-3 font-['Inter',sans-serif] text-white text-[14px] outline-none focus:border-[rgba(255,144,109,0.4)]"
          />
        </label>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={loading}
          className="bg-[#262626] rounded-[12px] border border-[rgba(72,72,71,0.3)] px-5 py-3 font-['Inter',sans-serif] text-[#adaaaa] text-[13px] cursor-pointer hover:border-[rgba(255,144,109,0.35)] disabled:opacity-50"
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
        <button
          type="button"
          onClick={() => void handleStartCycle()}
          disabled={startingCycle || loading || hasOpenCycle}
          className="bg-[#262626] rounded-[12px] border border-[rgba(255,144,109,0.24)] px-5 py-3 font-['Inter',sans-serif] text-[#ffcf9f] text-[13px] cursor-pointer hover:border-[rgba(255,144,109,0.45)] disabled:opacity-50"
        >
          {startingCycle ? "Iniciando..." : "Iniciar nuevo ciclo"}
        </button>
        <button
          type="button"
          onClick={() => void handleImprimir()}
          disabled={printing || loading || !hasOpenCycle}
          className="bg-[#ff906d] rounded-[12px] px-6 py-3 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[13px] uppercase tracking-wide cursor-pointer border-none shadow-[0px_0px_16px_0px_rgba(255,144,109,0.25)] disabled:opacity-50"
        >
          {printing ? "Imprimiendo..." : "Imprimir cierre (térmica)"}
        </button>
      </div>

      {loadError && (
        <div className="bg-[rgba(255,113,108,0.08)] border border-[rgba(255,113,108,0.25)] rounded-[12px] px-4 py-3">
          <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">{loadError}</span>
        </div>
      )}

      {printMsg && (
        <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.2)] rounded-[12px] px-4 py-3">
          <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">{printMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(255,144,109,0.2)] p-6">
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] uppercase tracking-wide mb-2">
            {fechaLegible}
          </div>
          {currentCycle ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
                    Ciclo #{currentCycle.cycle_number}
                  </div>
                  <div className="font-['Inter',sans-serif] text-[#6b7280] text-[13px] mt-1">
                    {currentCycle.closed_at == null ? "Abierto" : "Cerrado"}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wide font-['Inter',sans-serif] ${
                    currentCycle.closed_at == null
                      ? "bg-[rgba(89,238,80,0.12)] text-[#59ee50]"
                      : "bg-[rgba(255,144,109,0.12)] text-[#ffcf9f]"
                  }`}
                >
                  {currentCycle.closed_at == null ? "En curso" : "Finalizado"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoRow label="Hora de entrada" value={formatCycleDateTime(currentCycle.opened_at)} />
                <InfoRow label="Hora de salida" value={formatCycleDateTime(currentCycle.closed_at)} />
              </div>
              <p className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                Si el restaurante extiende horario después de medianoche, este ciclo sigue atado al día
                operativo seleccionado y no al cambio de fecha calendario.
              </p>
            </div>
          ) : (
            <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px]">
              No hay ciclos registrados para este día operativo. Iniciá uno para comenzar el control de
              cierre.
            </p>
          )}
        </div>

        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6">
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] mb-4">
            Historial del día
          </h2>
          {cycles.length === 0 ? (
            <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
              Sin ciclos todavía.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 max-h-[260px] overflow-y-auto">
              {cycles.map((cycle) => (
                <li
                  key={cycle.id}
                  className="rounded-[14px] border border-[rgba(72,72,71,0.18)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-['Space_Grotesk',sans-serif] text-white text-[15px]">
                      Ciclo #{cycle.cycle_number}
                    </span>
                    <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-wide">
                      {cycle.closed_at == null ? "Abierto" : "Cerrado"}
                    </span>
                  </div>
                  <div className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] mt-2">
                    Entrada: {formatCycleDateTime(cycle.opened_at)}
                  </div>
                  <div className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                    Salida: {formatCycleDateTime(cycle.closed_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total cobrado (pagadas)" value={RD(resumen.totalPagado)} accent="#59ee50" />
        <StatCard title="Facturas pagadas" value={String(resumen.pagadas.length)} />
        <StatCard
          title="Pendientes"
          value={`${resumen.pendientes.length} · ${RD(resumen.totalPendiente)}`}
          accent="#ff6aa0"
        />
        <StatCard title="Canceladas" value={String(resumen.canceladas.length)} accent="#ff716c" />
      </div>

      <div className="bg-[#131313] rounded-[20px] border border-[rgba(255,144,109,0.2)] p-6">
        <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] mb-1">
          Mesas con deuda pendiente
        </h2>
        <p className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] mb-4">
          Mientras exista una mesa con saldo abierto, el sistema bloquea la impresión del cierre.
        </p>
        {resumenCuentasAbiertas.lineas === 0 ? (
          <p className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">
            No hay consumos pendientes de facturar. El cierre puede imprimirse.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard
                title="Líneas / mesas con saldo"
                value={`${resumenCuentasAbiertas.lineas} · ${resumenCuentasAbiertas.mesasDistintas}`}
                accent="#ff906d"
              />
              <StatCard title="Subtotal pendiente" value={RD(resumenCuentasAbiertas.subtotal)} />
              <StatCard
                title="Total estimado (+ ITBIS 18%)"
                value={RD(resumenCuentasAbiertas.totalEst)}
                accent="#ffd06d"
              />
            </div>
            {resumenCuentasAbiertas.porMesa.length > 0 && (
              <div>
                <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-wide mb-2">
                  Por mesa (subtotal)
                </div>
                <ul className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                  {resumenCuentasAbiertas.porMesa.map(({ mesa, subtotal }) => (
                    <li
                      key={mesa}
                      className="flex justify-between items-center border-b border-[rgba(72,72,71,0.2)] pb-2 last:border-0"
                    >
                      <span className="font-['Inter',sans-serif] text-white text-[14px]">
                        {mesa === 0 ? "Para llevar" : `Mesa ${mesa}`}
                      </span>
                      <span className="font-['Space_Grotesk',sans-serif] text-[#ff906d] text-[14px] tabular-nums">
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

      <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6">
        <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] mb-4">
          Por método de pago (solo pagadas)
        </h2>
        {resumen.porMetodo.length === 0 ? (
          <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
            Sin ventas pagadas en este ciclo.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {resumen.porMetodo.map((m) => (
              <li
                key={m.etiqueta}
                className="flex justify-between items-center border-b border-[rgba(72,72,71,0.2)] pb-3 last:border-0"
              >
                <span className="font-['Inter',sans-serif] text-white text-[14px]">{m.etiqueta}</span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px]">
                  {m.cantidad} fact. · {RD(m.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6">
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase mb-2">
            Subtotal (pagadas)
          </div>
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px]">
            {RD(resumen.subtotalPagado)}
          </div>
        </div>
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6">
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase mb-2">
            ITBIS (pagadas)
          </div>
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px]">
            {RD(resumen.itbisPagado)}
          </div>
        </div>
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6 sm:col-span-2">
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase mb-2">
            Ticket promedio (pagadas)
          </div>
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[22px]">
            {resumen.pagadas.length > 0 ? RD(resumen.ticketPromedioPagado) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a1a] rounded-[14px] px-4 py-3 border border-[rgba(72,72,71,0.18)]">
      <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="font-['Inter',sans-serif] text-white text-[14px]">{value}</div>
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
    <div className="bg-[#201f1f] rounded-[16px] p-5 border border-[rgba(72,72,71,0.12)]">
      <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-wide mb-2">
        {title}
      </div>
      <div
        className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] sm:text-[22px]"
        style={{ color: accent ?? "#fff" }}
      >
        {value}
      </div>
    </div>
  );
}
