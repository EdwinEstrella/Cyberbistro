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

function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const da = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function localDayBoundsIso(ymd: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

const METODO_ETIQUETA: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  digital: "Digital",
};

function etiquetaMetodo(m: string): string {
  return METODO_ETIQUETA[m] ?? m.charAt(0).toUpperCase() + m.slice(1);
}

const RD = (n: number) =>
  "RD$ " +
  n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Cierre() {
  const { tenantId, loading: authLoading } = useAuth();
  const [fecha, setFecha] = useState(todayYmd);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState("");

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

    const ticketPromedioPagado =
      pagadas.length > 0 ? totalPagado / pagadas.length : 0;

    return {
      pagadas,
      pendientes,
      canceladas,
      totalPagado,
      subtotalPagado,
      itbisPagado,
      totalPendiente,
      porMetodo,
      ticketPromedioPagado,
    };
  }, [facturas]);

  const fechaLegible = useMemo(() => {
    const b = localDayBoundsIso(fecha);
    if (!b) return fecha;
    return new Date(b.start).toLocaleDateString("es-DO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [fecha]);

  const cargar = useCallback(async () => {
    if (!tenantId) {
      setFacturas([]);
      setLoading(false);
      return;
    }
    const bounds = localDayBoundsIso(fecha);
    if (!bounds) {
      setLoadError("Fecha inválida.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    const { data, error } = await insforgeClient.database
      .from("facturas")
      .select("id, estado, metodo_pago, subtotal, itbis, total, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", bounds.start)
      .lte("created_at", bounds.end)
      .order("created_at", { ascending: true });

    if (error) {
      setLoadError(error.message || "No se pudieron cargar las facturas.");
      setFacturas([]);
    } else {
      setFacturas((data as FacturaRow[]) ?? []);
    }
    setLoading(false);
  }, [tenantId, fecha]);

  useEffect(() => {
    if (authLoading) return;
    void cargar();
  }, [authLoading, cargar]);

  async function handleImprimir() {
    if (!tenantId) return;
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

    const { paperWidthMm } = getThermalPrintSettings();
    const generadoEn = new Date().toLocaleString("es-DO");

    const html = buildCierreDiaReceiptHtml(
      tenantInfo,
      {
        fechaOperacion: fechaLegible,
        generadoEn,
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
    } else {
      setPrintMsg("Listo. Si usás navegador, se abrió el cuadro de impresión para guardar PDF o imprimir.");
      setTimeout(() => setPrintMsg(""), 5000);
    }
    setPrinting(false);
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
          Tu usuario no está vinculado a un negocio. El cierre solo incluye facturas de tu negocio.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-6 lg:p-[32px] overflow-y-auto flex flex-col gap-6 max-w-[900px]">
      <div>
        <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
          Cierre de día
        </h1>
        <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px] mt-2">
          Resumen de facturas del día (por fecha de emisión), solo de tu negocio. Imprimí el ticket
          térmico para archivo o arqueo de caja.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-wide">
            Día a cerrar
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
          {loading ? "Cargando…" : "Actualizar"}
        </button>
        <button
          type="button"
          onClick={() => void handleImprimir()}
          disabled={printing || loading}
          className="bg-[#ff906d] rounded-[12px] px-6 py-3 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[13px] uppercase tracking-wide cursor-pointer border-none shadow-[0px_0px_16px_0px_rgba(255,144,109,0.25)] disabled:opacity-50"
        >
          {printing ? "Imprimiendo…" : "Imprimir cierre (térmica)"}
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

      <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] capitalize">{fechaLegible}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total cobrado (pagadas)" value={RD(resumen.totalPagado)} accent="#59ee50" />
        <StatCard title="Facturas pagadas" value={String(resumen.pagadas.length)} />
        <StatCard title="Pendientes" value={`${resumen.pendientes.length} · ${RD(resumen.totalPendiente)}`} accent="#ff6aa0" />
        <StatCard title="Canceladas" value={String(resumen.canceladas.length)} accent="#ff716c" />
      </div>

      <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6">
        <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] mb-4">
          Por método de pago (solo pagadas)
        </h2>
        {resumen.porMetodo.length === 0 ? (
          <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">Sin ventas pagadas en este día.</p>
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
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase mb-2">Subtotal (pagadas)</div>
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px]">
            {RD(resumen.subtotalPagado)}
          </div>
        </div>
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-6">
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase mb-2">ITBIS (pagadas)</div>
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
