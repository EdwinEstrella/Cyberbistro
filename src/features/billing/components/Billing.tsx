import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Eye, Printer, Trash2 } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { APP_ACCESS_PIN } from "../../../shared/lib/accessPin";
import { PinGateModal } from "../../../shared/components/PinGate";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";

type InvoiceStatus = "pagada" | "pendiente" | "cancelada";
type BillingView = "facturas" | "ciclos";

interface InvoiceItem {
  plato_id: number;
  nombre: string;
  categoria?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface Invoice {
  id: string;
  tenant_id?: string;
  numero_factura: number;
  mesa_numero: number | null;
  metodo_pago: string;
  estado: InvoiceStatus;
  subtotal: number;
  itbis: number;
  propina: number;
  total: number;
  items: InvoiceItem[];
  created_at: string;
  pagada_at: string | null;
  notas?: string | null;
  ncf?: string | null;
  ncf_tipo?: string | null;
  cliente_nombre?: string | null;
  cliente_rnc?: string | null;
}

interface CierreOperativoRow {
  id: string;
  business_day: string;
  cycle_number: number;
  opened_at: string;
  closed_at: string | null;
  printed_at: string | null;
}

interface CycleMethodSummary {
  method: string;
  label: string;
  count: number;
  total: number;
}

interface CycleSummary {
  cycle: CierreOperativoRow;
  invoices: Invoice[];
  paidInvoices: Invoice[];
  pendingInvoices: Invoice[];
  cancelledInvoices: Invoice[];
  totalSold: number;
  subtotalSold: number;
  taxSold: number;
  avgTicket: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  methodBreakdown: CycleMethodSummary[];
}

const statusConfig: Record<InvoiceStatus, { label: string; color: string; bg: string; shadow?: string }> = {
  pagada: { label: "PAGADA", color: "#59ee50", bg: "rgba(89,238,80,0.1)", shadow: "0px 0px 15px 0px rgba(89,238,80,0.2)" },
  pendiente: { label: "PENDIENTE", color: "#ff906d", bg: "rgba(255,144,109,0.1)" },
  cancelada: { label: "CANCELADA", color: "#ff716c", bg: "rgba(255,113,108,0.1)" },
};

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function itemCount(inv: Invoice): number {
  const items = inv.items;
  return Array.isArray(items) ? items.length : 0;
}

async function hydrateInvoiceItemCategories(tenantId: string, rawInvoices: Invoice[]): Promise<Invoice[]> {
  const plateIds = [
    ...new Set(
      rawInvoices.flatMap((invoice) =>
        Array.isArray(invoice.items)
          ? invoice.items
              .map((item) => Number(item.plato_id))
              .filter((id) => Number.isFinite(id))
          : []
      )
    ),
  ];

  const categoriaPorPlato = new Map<number, string>();

  if (plateIds.length > 0) {
    const { data } = await insforgeClient.database
      .from("platos")
      .select("id, categoria")
      .eq("tenant_id", tenantId)
      .in("id", plateIds);

    for (const plate of (data as Array<{ id: number; categoria?: string | null }>) ?? []) {
      categoriaPorPlato.set(plate.id, plate.categoria?.trim() || "General");
    }
  }

  return rawInvoices.map((invoice) => ({
    ...invoice,
    items: Array.isArray(invoice.items)
      ? invoice.items.map((item) => ({
          ...item,
          categoria:
            item.categoria?.trim() ||
            categoriaPorPlato.get(Number(item.plato_id)) ||
            "General",
        }))
      : [],
  }));
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Pendiente";
  return new Date(iso).toLocaleString("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}



function getMethodDisplay(method: string): { label: string; pillClass: string } {
  switch (method) {
    case "efectivo":
      return { label: "Efectivo", pillClass: "bg-[rgba(89,238,80,0.12)] text-[#59ee50]" };
    case "tarjeta":
      return { label: "Tarjeta", pillClass: "bg-[rgba(147,197,253,0.12)] text-[#93c5fd]" };
    case "digital":
      return { label: "Digital", pillClass: "bg-[rgba(255,144,109,0.12)] text-[#ff906d]" };
    case "transferencia":
      return { label: "Transferencia", pillClass: "bg-[rgba(196,181,253,0.12)] text-[#c4b5fd]" };
    default:
      return { label: method, pillClass: "bg-[#333] text-[#adaaaa]" };
  }
}

function isWithinRange(iso: string, from: string, to: string): boolean {
  const value = new Date(iso).getTime();
  const fromMs = new Date(from + "T00:00:00").getTime();
  const toMs = new Date(to + "T23:59:59").getTime();
  return value >= fromMs && value <= toMs;
}

function businessDayInFilter(businessDay: string, from: string, to: string): boolean {
  if (from && businessDay < from) return false;
  if (to && businessDay > to) return false;
  return true;
}

export function Billing() {
  const { tenantId, loading: authLoading } = useAuth();
  const [view, setView] = useState<BillingView>("facturas");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cycles, setCycles] = useState<CierreOperativoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [invoiceModal, setInvoiceModal] = useState<Invoice | null>(null);
  const [deletePinInvoice, setDeletePinInvoice] = useState<Invoice | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);

  const loadBillingData = useCallback(async () => {
    if (!tenantId) {
      setInvoices([]);
      setCycles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [invoicesRes, cyclesRes] = await Promise.all([
      insforgeClient.database
        .from("facturas")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      insforgeClient.database
        .from("cierres_operativos")
        .select("id, business_day, cycle_number, opened_at, closed_at, printed_at")
        .eq("tenant_id", tenantId)
        .order("opened_at", { ascending: false }),
    ]);

    if (!invoicesRes.error && invoicesRes.data) {
      const hydratedInvoices = await hydrateInvoiceItemCategories(tenantId, invoicesRes.data as Invoice[]);
      setInvoices(hydratedInvoices);
    } else {
      setInvoices([]);
    }

    if (!cyclesRes.error && cyclesRes.data) {
      setCycles(cyclesRes.data as CierreOperativoRow[]);
    } else {
      setCycles([]);
    }

    setCurrentPage(1);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (authLoading) return;
    void loadBillingData();
  }, [authLoading, loadBillingData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, methodFilter, dateFrom, dateTo, view]);

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (statusFilter !== "todos") {
      filtered = filtered.filter((inv) => inv.estado === statusFilter);
    }
    if (methodFilter !== "todos") {
      filtered = filtered.filter((inv) => inv.metodo_pago === methodFilter);
    }
    if (dateFrom) {
      filtered = filtered.filter((inv) => new Date(inv.created_at).getTime() >= new Date(dateFrom + "T00:00:00").getTime());
    }
    if (dateTo) {
      filtered = filtered.filter((inv) => new Date(inv.created_at).getTime() <= new Date(dateTo + "T23:59:59").getTime());
    }
    return filtered;
  }, [invoices, statusFilter, methodFilter, dateFrom, dateTo]);

  const cycleSummaries = useMemo<CycleSummary[]>(() => {
    return cycles.map((cycle) => {
      const cycleEndIso = cycle.closed_at ?? new Date().toISOString();
      const cycleInvoices = invoices
        .filter((inv) => {
          const createdAt = new Date(inv.created_at).getTime();
          return (
            createdAt >= new Date(cycle.opened_at).getTime() &&
            createdAt <= new Date(cycleEndIso).getTime()
          );
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const paidInvoices = cycleInvoices.filter((inv) => inv.estado === "pagada");
      const pendingInvoices = cycleInvoices.filter((inv) => inv.estado === "pendiente");
      const cancelledInvoices = cycleInvoices.filter((inv) => inv.estado === "cancelada");
      const totalSold = paidInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const subtotalSold = paidInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
      const taxSold = paidInvoices.reduce((sum, inv) => sum + inv.itbis, 0);
      const avgTicket = paidInvoices.length > 0 ? totalSold / paidInvoices.length : 0;

      const methodMap = new Map<string, CycleMethodSummary>();
      for (const inv of paidInvoices) {
        const display = getMethodDisplay(inv.metodo_pago);
        const current = methodMap.get(inv.metodo_pago) ?? {
          method: inv.metodo_pago,
          label: display.label,
          count: 0,
          total: 0,
        };
        current.count += 1;
        current.total += inv.total;
        methodMap.set(inv.metodo_pago, current);
      }

      return {
        cycle,
        invoices: cycleInvoices,
        paidInvoices,
        pendingInvoices,
        cancelledInvoices,
        totalSold,
        subtotalSold,
        taxSold,
        avgTicket,
        firstSaleAt: cycleInvoices[0]?.created_at ?? null,
        lastSaleAt: cycleInvoices[cycleInvoices.length - 1]?.created_at ?? null,
        methodBreakdown: [...methodMap.values()].sort((a, b) => b.total - a.total),
      };
    });
  }, [cycles, invoices]);

  const filteredCycleSummaries = useMemo(() => {
    return cycleSummaries.filter(({ cycle, invoices: cycleInvoices }) => {
      if (dateFrom || dateTo) {
        if (businessDayInFilter(cycle.business_day, dateFrom, dateTo)) {
          return true;
        }

        return cycleInvoices.some((inv) =>
          isWithinRange(
            inv.created_at,
            dateFrom || "1900-01-01",
            dateTo || "2999-12-31"
          )
        );
      }

      return true;
    });
  }, [cycleSummaries, dateFrom, dateTo]);

  const { totalRevenue, pendingCount, pendingAmount } = useMemo(() => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentInvoices = invoices.filter(
      (inv) => new Date(inv.created_at) > last24h && inv.estado === "pagada"
    );
    const pending = invoices.filter((inv) => inv.estado === "pendiente");
    return {
      totalRevenue: recentInvoices.reduce((sum, inv) => sum + inv.total, 0),
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, inv) => sum + inv.total, 0),
    };
  }, [invoices]);

  const cycleKpis = useMemo(() => {
    const closedCycles = filteredCycleSummaries.filter((entry) => entry.cycle.closed_at != null);
    const activeCycles = filteredCycleSummaries.filter((entry) => entry.cycle.closed_at == null);
    const totalCycleSales = filteredCycleSummaries.reduce((sum, entry) => sum + entry.totalSold, 0);
    return {
      totalCycles: filteredCycleSummaries.length,
      closedCycles: closedCycles.length,
      activeCycles: activeCycles.length,
      totalCycleSales,
    };
  }, [filteredCycleSummaries]);

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = useMemo(
    () => filteredInvoices.slice(startIndex, endIndex),
    [filteredInvoices, startIndex, endIndex]
  );

  const printInvoice = useCallback(
    async (inv: Invoice) => {
      if (!tenantId) return;
      if (inv.tenant_id != null && inv.tenant_id !== tenantId) return;

      const tid = inv.tenant_id ?? tenantId;

      const { data: tenant, error: tenantError } = await insforgeClient.database
        .from("tenants")
        .select("nombre_negocio, rnc, direccion, telefono, logo_url")
        .eq("id", tid)
        .single();

      if (tenantError || !tenant) {
        console.error("Error al cargar datos del negocio para imprimir:", tenantError);
        return;
      }

      const items = Array.isArray(inv.items) ? inv.items : [];
      const paperWidthMm = getThermalPrintSettings().paperWidthMm;
      const html = buildFacturaReceiptHtml(
        {
          nombre_negocio: tenant.nombre_negocio,
          rnc: tenant.rnc,
          direccion: tenant.direccion,
          telefono: tenant.telefono,
          logo_url: tenant.logo_url,
        },
        {
          items,
          subtotal: inv.subtotal,
          itbis: inv.itbis,
          total: inv.total,
          metodo_pago: inv.metodo_pago,
          mesa_numero: inv.mesa_numero,
          notas: inv.notas ?? null,
          pagada_at: inv.pagada_at,
          created_at: inv.created_at,
          estado: inv.estado,
          propina: inv.propina,
          ncf: inv.ncf ?? null,
          ncf_tipo: inv.ncf_tipo ?? null,
          cliente_nombre: inv.cliente_nombre ?? null,
          cliente_rnc: inv.cliente_rnc ?? null,
        },
        inv.numero_factura,
        paperWidthMm
      );

      const res = await printThermalHtml(html);
      if (!res.ok && res.error) {
        console.warn("Impresion factura:", res.error);
      }
    },
    [tenantId]
  );

  const deleteInvoiceAndTraces = useCallback(
    async (inv: Invoice) => {
      if (!tenantId) return;
      if (inv.tenant_id != null && inv.tenant_id !== tenantId) return;

      setDeletingInvoiceId(inv.id);

      const { error: consumosError } = await insforgeClient.database
        .from("consumos")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("factura_id", inv.id);

      if (consumosError) {
        console.error("Error al desvincular consumos de la factura:", consumosError);
        alert(`No se pudo limpiar consumos vinculados: ${consumosError.message}`);
        setDeletingInvoiceId(null);
        return;
      }

      const { error: facturaError } = await insforgeClient.database
        .from("facturas")
        .delete()
        .eq("id", inv.id)
        .eq("tenant_id", tenantId);

      if (facturaError) {
        console.error("Error al eliminar factura:", facturaError);
        alert(`No se pudo eliminar la factura: ${facturaError.message}`);
        setDeletingInvoiceId(null);
        return;
      }

      setInvoiceModal((open) => (open?.id === inv.id ? null : open));
      await loadBillingData();
      setDeletingInvoiceId(null);
    },
    [tenantId, loadBillingData]
  );

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
          Tu usuario no esta vinculado a un negocio. Las analiticas solo muestran facturas de tu
          negocio.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando analiticas...
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-5 sm:p-8 lg:p-10 flex flex-col gap-6 sm:gap-8 lg:gap-10 overflow-auto max-w-[1600px] w-full mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="font-['Inter',sans-serif] text-[12px] uppercase tracking-[0.28em] text-[#ff906d]">
            Analiticas operativas
          </div>
          <h1 className="font-['Space_Grotesk',sans-serif] text-white text-[30px] sm:text-[38px] font-bold leading-none">
            Facturas y ciclos
          </h1>
          <p className="font-['Inter',sans-serif] text-[#8e8e8e] text-[14px] max-w-3xl leading-relaxed">
            En facturas ves el detalle de cobros. En ciclos puedes revisar cada cierre enumerado,
            cuanto vendio y desde que hora hasta que hora opero.
          </p>
        </div>

        <div className="bg-[#151515] rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5 flex items-center gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setView("facturas")}
            className={`flex-1 sm:flex-none rounded-xl px-5 py-3 font-['Inter',sans-serif] text-[14px] font-semibold transition-colors ${
              view === "facturas"
                ? "bg-[#59ee50] text-black"
                : "text-[#c5c5c5] hover:text-white hover:bg-[#242424]"
            }`}
          >
            Facturas
          </button>
          <button
            type="button"
            onClick={() => setView("ciclos")}
            className={`flex-1 sm:flex-none rounded-xl px-5 py-3 font-['Inter',sans-serif] text-[14px] font-semibold transition-colors ${
              view === "ciclos"
                ? "bg-[#ff906d] text-black"
                : "text-[#c5c5c5] hover:text-white hover:bg-[#242424]"
            }`}
          >
            Ciclos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#201f1f] rounded-[18px] overflow-hidden relative min-h-[140px]">
          <div className="flex flex-col gap-3 p-5 pb-10">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-wide uppercase">
              {view === "facturas" ? "Ingreso Total (24h)" : "Venta Total en Ciclos"}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] leading-none">$</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px] tracking-tight leading-none tabular-nums">
                {(view === "facturas" ? totalRevenue : cycleKpis.totalCycleSales).toLocaleString("es-DO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="font-['Inter',sans-serif] font-medium text-[#59ee50] text-[12px] leading-snug">
                {view === "facturas" ? "Facturas recientes" : `${cycleKpis.totalCycles} ciclos listados`}
              </span>
            </div>
          </div>
          <div className="absolute bg-[rgba(255,144,109,0.05)] blur-[32px] right-[-16px] rounded-full size-[80px] top-[-16px]" />
        </div>

        <div className="bg-[#201f1f] rounded-[18px] overflow-hidden min-h-[140px]">
          <div className="flex flex-col gap-3 p-5 pb-10">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-wide uppercase">
              {view === "facturas" ? "Ticket Promedio" : "Ciclos Cerrados"}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] leading-none">
                {view === "facturas" ? "$" : "#"}
              </span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px] tracking-tight leading-none tabular-nums">
                {view === "facturas"
                  ? (invoices.length > 0
                      ? invoices.reduce((sum, inv) => sum + inv.total, 0) / invoices.length
                      : 0
                    ).toLocaleString("es-DO", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : cycleKpis.closedCycles}
              </span>
            </div>
            <div className="flex gap-3 items-center">
              <div className="bg-white/40 h-px w-3 shrink-0" />
              <span className="font-['Inter',sans-serif] font-medium text-white/40 text-[12px] leading-snug">
                {view === "facturas"
                  ? `${invoices.length} facturas totales`
                  : `${cycleKpis.activeCycles} ciclos activos`}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#201f1f] rounded-[18px] overflow-hidden min-h-[140px]">
          <div className="flex flex-col gap-3 p-5 pb-8">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-wide uppercase">
              {view === "facturas" ? "Facturas Pendientes" : "Facturas en Ciclos"}
            </div>
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[28px] tracking-tight leading-none tabular-nums">
              {view === "facturas"
                ? pendingCount
                : filteredCycleSummaries.reduce((sum, entry) => sum + entry.invoices.length, 0)}
            </div>
            <div className="flex gap-2 items-center">
              <span className="font-['Inter',sans-serif] font-medium text-[#ff6aa0] text-[12px] leading-snug">
                {view === "facturas"
                  ? `${RD(pendingAmount)} en espera`
                  : `${filteredCycleSummaries.reduce((sum, entry) => sum + entry.pendingInvoices.length, 0)} pendientes dentro de ciclos`}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#131313] rounded-[18px] border border-[rgba(255,144,109,0.05)] min-h-[140px]">
          <div className="flex flex-col gap-3 p-5 pb-10">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-wide uppercase">
              {view === "facturas" ? "Total Facturas" : "Cierre Mas Reciente"}
            </div>
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[28px] tracking-tight leading-none tabular-nums">
              {view === "facturas"
                ? invoices.length
                : filteredCycleSummaries[0]?.cycle.cycle_number != null
                  ? `#${filteredCycleSummaries[0].cycle.cycle_number}`
                  : "--"}
            </div>
            <div className="flex gap-2 items-center">
              <span className="font-['Inter',sans-serif] font-medium text-[#adaaaa] text-[12px] leading-snug">
                {view === "facturas"
                  ? "Registradas en el sistema"
                  : filteredCycleSummaries[0]
                    ? formatDateTime(filteredCycleSummaries[0].cycle.closed_at ?? filteredCycleSummaries[0].cycle.opened_at)
                    : "Sin cierres todavia"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] rounded-2xl border border-[rgba(255,255,255,0.05)] p-4 sm:p-5 flex flex-wrap items-center gap-4 sm:gap-5 justify-between">
        <div className="flex flex-wrap gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="flex items-center gap-2">
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-black rounded-xl border border-[rgba(72,72,71,0.3)] px-4 py-3 min-h-[44px] font-['Inter',sans-serif] text-white text-[14px] cursor-pointer focus:border-[rgba(255,144,109,0.4)] outline-none"
              title="Desde"
            />
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] shrink-0">a</span>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-black rounded-xl border border-[rgba(72,72,71,0.3)] px-4 py-3 min-h-[44px] font-['Inter',sans-serif] text-white text-[14px] cursor-pointer focus:border-[rgba(255,144,109,0.4)] outline-none"
              title="Hasta"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] hover:text-white transition-colors px-2"
                title="Limpiar rango"
              >
                Limpiar
              </button>
            )}
          </div>

          {view === "facturas" ? (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-black rounded-xl border border-[rgba(72,72,71,0.3)] px-5 py-3 min-h-[44px] font-['Inter',sans-serif] text-white text-[15px] cursor-pointer"
              >
                <option value="todos">Todos los Estados</option>
                <option value="pagada">Pagadas</option>
                <option value="pendiente">Pendientes</option>
                <option value="cancelada">Canceladas</option>
              </select>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="bg-black rounded-xl border border-[rgba(72,72,71,0.3)] px-5 py-3 min-h-[44px] font-['Inter',sans-serif] text-white text-[15px] cursor-pointer"
              >
                <option value="todos">Todos los Metodos</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="digital">Digital</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </>
          ) : (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#121212] px-4 py-3">
              <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                Historial de ciclos
              </div>
              <div className="font-['Inter',sans-serif] text-[14px] text-white mt-1">
                Revisa cada cierre enumerado, su rango de operacion y el detalle de lo vendido.
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => void loadBillingData()}
          className="bg-[#262626] rounded-xl border border-[rgba(72,72,71,0.2)] flex gap-2 items-center px-6 py-3 min-h-[44px] cursor-pointer hover:border-[rgba(255,144,109,0.3)] transition-colors shrink-0"
        >
          <span className="font-['Inter',sans-serif] text-white text-[15px]">Actualizar</span>
        </button>
      </div>

      {view === "facturas" ? (
        <div className="overflow-x-auto rounded-[24px] -mx-1 px-1">
          <div className="bg-[#131313] rounded-[24px] border border-[rgba(72,72,71,0.1)] overflow-hidden min-w-[920px]">
            <div className="bg-[rgba(32,31,31,0.5)] grid grid-cols-[minmax(7rem,8rem)_minmax(8.5rem,10rem)_minmax(11rem,1.2fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_minmax(9rem,11rem)_minmax(9.5rem,11rem)] px-6 sm:px-10 gap-x-4">
              {["ID Factura", "Fecha", "Mesa", "Metodo", "Estado", "Monto", "Acciones"].map((h, i) => (
                <div key={i} className={`py-6 ${i >= 5 ? "text-right" : ""}`}>
                  <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[11px] sm:text-xs tracking-[0.12em] uppercase whitespace-pre-line leading-relaxed block">
                    {h}
                  </span>
                </div>
              ))}
            </div>

            {pageData.length === 0 ? (
              <div className="px-10 py-16 text-center">
                <span className="font-['Inter',sans-serif] text-[#6b7280] text-[15px]">
                  No se encontraron facturas
                </span>
              </div>
            ) : (
              pageData.map((inv, idx) => {
                const status = statusConfig[inv.estado];
                const method = getMethodDisplay(inv.metodo_pago);
                const date = new Date(inv.created_at);
                return (
                  <div
                    key={inv.id}
                    className={`grid grid-cols-[minmax(7rem,8rem)_minmax(8.5rem,10rem)_minmax(11rem,1.2fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_minmax(9rem,11rem)_minmax(9.5rem,11rem)] px-6 sm:px-10 gap-x-4 items-center ${idx > 0 ? "border-t border-[rgba(255,255,255,0.05)]" : ""}`}
                  >
                    <div className="py-9">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[17px] tabular-nums">
                        #{String(inv.numero_factura).padStart(4, "0")}
                      </span>
                    </div>
                    <div className="py-9 space-y-1.5">
                      <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[15px] leading-snug">
                        {date.toLocaleDateString("es-DO")}
                      </div>
                      <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] opacity-60">
                        {date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="py-9 flex gap-4 items-center min-w-0">
                      <div
                        className="rounded-lg flex items-center justify-center h-9 px-2.5 min-w-[2.25rem] shrink-0"
                        style={{
                          backgroundColor:
                            inv.mesa_numero != null && inv.mesa_numero !== 0
                              ? "rgba(255,144,109,0.1)"
                              : "rgba(89,238,80,0.1)",
                        }}
                      >
                        <span
                          className="font-['Inter',sans-serif] font-bold text-[13px] tabular-nums"
                          style={{
                            color:
                              inv.mesa_numero != null && inv.mesa_numero !== 0 ? "#ff906d" : "#59ee50",
                          }}
                        >
                          {inv.mesa_numero != null && inv.mesa_numero !== 0
                            ? String(inv.mesa_numero).padStart(2, "0")
                            : "PL"}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="font-['Inter',sans-serif] font-medium text-white text-[15px] leading-snug">
                          {inv.mesa_numero != null && inv.mesa_numero !== 0
                            ? `Mesa ${inv.mesa_numero}`
                            : "Para llevar"}
                        </div>
                        <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">
                          {itemCount(inv)} productos
                        </div>
                      </div>
                    </div>
                    <div className="py-9 flex items-center">
                      <span
                        className={`font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md shrink-0 ${method.pillClass}`}
                      >
                        {method.label}
                      </span>
                    </div>
                    <div className="py-9">
                      <div
                        className="flex gap-2 items-center px-3.5 py-2 rounded-full w-fit max-w-full"
                        style={{ backgroundColor: status.bg, boxShadow: status.shadow }}
                      >
                        <div className="rounded-full size-2 shrink-0" style={{ backgroundColor: status.color }} />
                        <span
                          className="font-['Inter',sans-serif] font-bold text-[11px] tracking-wide uppercase leading-tight"
                          style={{ color: status.color }}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>
                    <div className="py-9 text-right">
                      <span
                        className="font-['Space_Grotesk',sans-serif] font-bold text-[19px] tabular-nums inline-block"
                        style={{ color: inv.estado === "cancelada" ? "#d7383b" : "white" }}
                      >
                        {RD(inv.total)}
                      </span>
                    </div>
                    <div className="py-9 flex gap-3 justify-end">
                      <button
                        className="bg-[#262626] rounded-lg size-10 flex items-center justify-center border-none cursor-pointer hover:bg-[#333] transition-colors shrink-0 text-[#adaaaa]"
                        title="Ver factura"
                        type="button"
                        aria-label="Ver factura"
                        onClick={() => setInvoiceModal(inv)}
                      >
                        <Eye className="size-[18px]" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        className="bg-[#262626] rounded-lg size-10 flex items-center justify-center border-none cursor-pointer hover:bg-[#333] transition-colors shrink-0 text-[#adaaaa]"
                        title="Imprimir factura"
                        type="button"
                        aria-label="Imprimir factura"
                        onClick={() => void printInvoice(inv)}
                      >
                        <Printer className="size-[18px]" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        className="bg-[#262626] rounded-lg size-10 flex items-center justify-center border-none cursor-pointer hover:bg-[rgba(255,113,108,0.15)] transition-colors shrink-0 text-[#ff716c] disabled:opacity-40"
                        title="Eliminar factura (clave Soporte)"
                        type="button"
                        aria-label="Eliminar factura, requiere clave de Soporte"
                        disabled={deletingInvoiceId === inv.id}
                        onClick={() => setDeletePinInvoice(inv)}
                      >
                        <Trash2 className="size-[18px]" strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {filteredInvoices.length > 0 && (
              <div className="border-t border-[rgba(255,255,255,0.05)] px-6 sm:px-10 py-6 flex flex-wrap items-center gap-4 justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[15px] leading-relaxed">
                  Mostrando{" "}
                  <span className="text-white font-bold tabular-nums">
                    {startIndex + 1} - {Math.min(endIndex, filteredInvoices.length)}
                  </span>{" "}
                  de <span className="text-white font-bold tabular-nums">{filteredInvoices.length}</span> facturas
                </span>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    type="button"
                    className="size-10 rounded-lg bg-[#262626] flex items-center justify-center border-none cursor-pointer disabled:opacity-50"
                  >
                    {"<"}
                  </button>
                  {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage <= 2) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 1) {
                      pageNum = totalPages - 2 + i;
                    } else {
                      pageNum = currentPage - 1 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`size-10 rounded-lg flex items-center justify-center border-none cursor-pointer font-['Inter',sans-serif] font-bold text-[13px] ${
                          currentPage === pageNum ? "bg-[#59ee50] text-black" : "bg-[#262626] text-white/50"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {totalPages > 3 && currentPage < totalPages - 1 && (
                    <span className="font-['Inter',sans-serif] text-white/30 text-sm px-1">...</span>
                  )}
                  {totalPages > 3 && (
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      className={`size-10 rounded-lg flex items-center justify-center border-none cursor-pointer font-['Inter',sans-serif] font-bold text-[13px] ${
                        currentPage === totalPages ? "bg-[#59ee50] text-black" : "bg-[#262626] text-white/50"
                      }`}
                    >
                      {totalPages}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="size-10 rounded-lg bg-[#262626] flex items-center justify-center border-none cursor-pointer disabled:opacity-50"
                  >
                    {">"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredCycleSummaries.length === 0 ? (
            <div className="bg-[#131313] rounded-[24px] border border-[rgba(255,255,255,0.06)] px-8 py-14 text-center">
              <div className="font-['Space_Grotesk',sans-serif] text-white text-[24px] font-bold">
                No hay ciclos para mostrar
              </div>
              <p className="font-['Inter',sans-serif] text-[#8f8f8f] text-[14px] mt-2">
                Ajusta el rango de fechas o crea cierres operativos para ver el historial.
              </p>
            </div>
          ) : (
            filteredCycleSummaries.map((entry, index) => {
              const { cycle } = entry;
              const isExpanded = expandedCycleId === cycle.id;
              const cycleStateLabel = cycle.closed_at ? "Cerrado" : "Abierto";
              const cycleStateClass = cycle.closed_at
                ? "bg-[rgba(89,238,80,0.12)] text-[#59ee50]"
                : "bg-[rgba(255,144,109,0.12)] text-[#ff906d]";

              return (
                <div
                  key={cycle.id}
                  className="bg-[#131313] rounded-[24px] border border-[rgba(255,255,255,0.06)] overflow-hidden"
                >
                  <div className="p-5 sm:p-7 flex flex-col gap-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.22em] text-[#8f8f8f]">
                            Ciclo enumerado {String(index + 1).padStart(2, "0")}
                          </div>
                          <span className={`px-3 py-1 rounded-full font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide ${cycleStateClass}`}>
                            {cycleStateLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <h2 className="font-['Space_Grotesk',sans-serif] text-white text-[26px] font-bold leading-none">
                            Ciclo #{cycle.cycle_number}
                          </h2>
                          <span className="font-['Inter',sans-serif] text-[#8f8f8f] text-[14px]">
                            Dia operativo {cycle.business_day}
                          </span>
                        </div>
                        <p className="font-['Inter',sans-serif] text-[#c5c5c5] text-[14px] leading-relaxed max-w-3xl">
                          Opero desde {formatDateTime(cycle.opened_at)} hasta {formatDateTime(cycle.closed_at)}.
                          {entry.firstSaleAt
                            ? ` Vendio desde ${formatDateTime(entry.firstSaleAt)} hasta ${formatDateTime(entry.lastSaleAt)}.`
                            : " No tuvo ventas registradas."}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 lg:justify-end">
                        <div className="min-w-[150px] rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#191919] px-4 py-3">
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                            Vendido
                          </div>
                          <div className="font-['Space_Grotesk',sans-serif] text-[24px] font-bold text-white mt-2">
                            {RD(entry.totalSold)}
                          </div>
                        </div>
                        <div className="min-w-[150px] rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#191919] px-4 py-3">
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                            Facturas
                          </div>
                          <div className="font-['Space_Grotesk',sans-serif] text-[24px] font-bold text-white mt-2">
                            {entry.invoices.length}
                          </div>
                        </div>
                        <div className="min-w-[150px] rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#191919] px-4 py-3">
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                            Ticket prom.
                          </div>
                          <div className="font-['Space_Grotesk',sans-serif] text-[24px] font-bold text-white mt-2">
                            {RD(entry.avgTicket)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
                      <div className="rounded-[20px] border border-[rgba(255,255,255,0.06)] bg-[#171717] p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                              Rango del ciclo
                            </div>
                            <div className="font-['Inter',sans-serif] text-white text-[15px] mt-1">
                              Apertura y cierre operativo
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Inicio
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {formatDateTime(cycle.opened_at)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Fin
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {formatDateTime(cycle.closed_at)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Hora primera venta
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {formatDateTime(entry.firstSaleAt)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Hora ultima venta
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {formatDateTime(entry.lastSaleAt)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-[rgba(255,255,255,0.06)] bg-[#171717] p-4 sm:p-5">
                        <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                          Resumen del cierre
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Subtotal
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {RD(entry.subtotalSold)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              ITBIS
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {RD(entry.taxSold)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Pagadas
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {entry.paidInvoices.length}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4">
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                              Pendientes
                            </div>
                            <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                              {entry.pendingInvoices.length}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-[rgba(255,255,255,0.06)] bg-[#171717] p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                            Metodos de pago
                          </div>
                          <div className="font-['Inter',sans-serif] text-white text-[15px] mt-1">
                            Distribucion de lo vendido en el ciclo
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedCycleId(isExpanded ? null : cycle.id)}
                          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] px-4 py-2.5 text-white font-['Inter',sans-serif] text-[13px] font-semibold hover:border-[rgba(255,144,109,0.3)] transition-colors"
                        >
                          {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                          <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>

                      {entry.methodBreakdown.length === 0 ? (
                        <div className="mt-4 rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-5 font-['Inter',sans-serif] text-[#8f8f8f] text-[14px]">
                          Sin ventas pagadas en este ciclo.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                          {entry.methodBreakdown.map((method) => {
                            const display = getMethodDisplay(method.method);
                            return (
                              <div
                                key={`${cycle.id}-${method.method}`}
                                className="rounded-2xl bg-[#111111] border border-[rgba(255,255,255,0.05)] px-4 py-4"
                              >
                                <span
                                  className={`inline-flex rounded-md px-2.5 py-1 font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide ${display.pillClass}`}
                                >
                                  {method.label}
                                </span>
                                <div className="font-['Space_Grotesk',sans-serif] text-white text-[20px] font-bold mt-3">
                                  {RD(method.total)}
                                </div>
                                <div className="font-['Inter',sans-serif] text-[#8f8f8f] text-[13px] mt-1">
                                  {method.count} facturas
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isExpanded ? (
                        <div className="mt-5 rounded-[20px] border border-[rgba(255,255,255,0.06)] overflow-hidden">
                          <div className="grid grid-cols-[minmax(6rem,7rem)_minmax(8rem,10rem)_minmax(8rem,1fr)_minmax(7.5rem,8rem)_minmax(8rem,9rem)] gap-3 px-4 sm:px-5 py-4 bg-[#111111]">
                            {["Factura", "Hora", "Origen", "Metodo", "Monto"].map((label) => (
                              <div key={label} className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#8f8f8f]">
                                {label}
                              </div>
                            ))}
                          </div>
                          {entry.invoices.length === 0 ? (
                            <div className="px-5 py-8 font-['Inter',sans-serif] text-[#8f8f8f] text-[14px]">
                              Este ciclo no tiene facturas asociadas.
                            </div>
                          ) : (
                            entry.invoices.map((inv, invoiceIndex) => {
                              const method = getMethodDisplay(inv.metodo_pago);
                              const status = statusConfig[inv.estado];
                              return (
                                <div
                                  key={inv.id}
                                  className={`grid grid-cols-[minmax(6rem,7rem)_minmax(8rem,10rem)_minmax(8rem,1fr)_minmax(7.5rem,8rem)_minmax(8rem,9rem)] gap-3 px-4 sm:px-5 py-4 items-center ${
                                    invoiceIndex > 0 ? "border-t border-[rgba(255,255,255,0.05)]" : ""
                                  }`}
                                >
                                  <div className="font-['Space_Grotesk',sans-serif] text-white text-[16px] font-bold">
                                    #{String(inv.numero_factura).padStart(4, "0")}
                                  </div>
                                  <div className="font-['Inter',sans-serif] text-[#d1d1d1] text-[14px]">
                                    {formatDateTime(inv.created_at)}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-['Inter',sans-serif] text-white text-[14px]">
                                      {inv.mesa_numero != null && inv.mesa_numero !== 0
                                        ? `Mesa ${inv.mesa_numero}`
                                        : "Para llevar"}
                                    </span>
                                    <span
                                      className="inline-flex items-center rounded-full px-2.5 py-1 font-['Inter',sans-serif] text-[10px] font-bold uppercase tracking-wide"
                                      style={{ backgroundColor: status.bg, color: status.color }}
                                    >
                                      {status.label}
                                    </span>
                                  </div>
                                  <div>
                                    <span
                                      className={`inline-flex rounded-md px-2.5 py-1 font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide ${method.pillClass}`}
                                    >
                                      {method.label}
                                    </span>
                                  </div>
                                  <div className="font-['Space_Grotesk',sans-serif] text-white text-[16px] font-bold text-right">
                                    {RD(inv.total)}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <Dialog open={invoiceModal !== null} onOpenChange={(open) => !open && setInvoiceModal(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-[rgba(255,255,255,0.08)] bg-[#201f1f] text-white sm:max-w-lg">
          {invoiceModal ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-['Space_Grotesk',sans-serif] text-xl text-white">
                  Factura #{String(invoiceModal.numero_factura).padStart(4, "0")}
                </DialogTitle>
                <DialogDescription className="font-['Inter',sans-serif] text-[#adaaaa] text-left">
                  {new Date(invoiceModal.created_at).toLocaleString("es-DO")}
                  {invoiceModal.mesa_numero != null && invoiceModal.mesa_numero !== 0
                    ? ` · Mesa ${invoiceModal.mesa_numero}`
                    : " · Para llevar"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-2 items-center">
                  {(() => {
                    const st = statusConfig[invoiceModal.estado];
                    const md = getMethodDisplay(invoiceModal.metodo_pago);
                    return (
                      <>
                        <div
                          className="flex gap-2 items-center px-3 py-1.5 rounded-full w-fit"
                          style={{ backgroundColor: st.bg, boxShadow: st.shadow }}
                        >
                          <div className="rounded-full size-2 shrink-0" style={{ backgroundColor: st.color }} />
                          <span
                            className="font-['Inter',sans-serif] font-bold text-[10px] tracking-wide uppercase"
                            style={{ color: st.color }}
                          >
                            {st.label}
                          </span>
                        </div>
                        <span
                          className={`font-['Inter',sans-serif] text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md ${md.pillClass}`}
                        >
                          {md.label}
                        </span>
                      </>
                    );
                  })()}
                </div>

                <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
                  <div className="grid grid-cols-[2.5rem_1fr_auto] gap-2 px-3 py-2 bg-[#262626] font-['Inter',sans-serif] text-[10px] font-bold uppercase tracking-wide text-[#adaaaa]">
                    <span>Cant.</span>
                    <span>Producto</span>
                    <span className="text-right">Subtotal</span>
                  </div>
                  <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
                    {(Array.isArray(invoiceModal.items) ? invoiceModal.items : []).map((line, i) => (
                      <li key={`${line.plato_id}-${i}`} className="grid grid-cols-[2.5rem_1fr_auto] gap-2 px-3 py-2.5 text-[14px]">
                        <span className="font-['Space_Grotesk',sans-serif] tabular-nums text-white">{line.cantidad}</span>
                        <span className="min-w-0 space-y-1">
                          <span className="block font-['Inter',sans-serif] text-[rgba(255,255,255,0.9)] break-words">
                            {line.nombre}
                          </span>
                          <span className="inline-flex max-w-full rounded-md bg-[rgba(255,144,109,0.1)] px-2 py-0.5 font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide text-[#ff906d]">
                            <span className="truncate">{line.categoria?.trim() || "General"}</span>
                          </span>
                        </span>
                        <span className="font-['Space_Grotesk',sans-serif] tabular-nums text-white text-right shrink-0">
                          {RD(line.subtotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {invoiceModal.ncf ? (
                  <div className="rounded-xl border border-[rgba(89,238,80,0.25)] bg-[rgba(89,238,80,0.06)] px-3 py-2.5 space-y-1">
                    <div className="font-['Inter',sans-serif] text-[10px] font-bold uppercase tracking-wide text-[#59ee50]">
                      Comprobante fiscal
                    </div>
                    <div className="font-['Space_Grotesk',sans-serif] text-[15px] font-bold text-white tracking-wide">
                      {invoiceModal.ncf}
                    </div>
                    {invoiceModal.ncf_tipo ? (
                      <div className="font-['Inter',sans-serif] text-[12px] text-[#adaaaa] leading-snug">
                        {invoiceModal.ncf_tipo}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1.5 font-['Inter',sans-serif] text-[14px] text-[#adaaaa]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="text-white tabular-nums">{RD(invoiceModal.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ITBIS</span>
                    <span className="text-white tabular-nums">{RD(invoiceModal.itbis)}</span>
                  </div>
                  {invoiceModal.propina > 0 ? (
                    <div className="flex justify-between">
                      <span>Propina</span>
                      <span className="text-white tabular-nums">{RD(invoiceModal.propina)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between pt-2 border-t border-[rgba(255,255,255,0.08)] font-['Space_Grotesk',sans-serif] font-bold text-[17px] text-white">
                    <span>Total</span>
                    <span className="tabular-nums">{RD(invoiceModal.total)}</span>
                  </div>
                </div>

                {invoiceModal.notas ? (
                  <p className="font-['Inter',sans-serif] text-[13px] text-[#adaaaa]">
                    <span className="text-white/80 font-medium">Nota: </span>
                    {invoiceModal.notas}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-between gap-3 pt-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,113,108,0.35)] bg-transparent text-[#ff716c] font-['Inter',sans-serif] font-bold text-[13px] px-4 py-2.5 cursor-pointer hover:bg-[rgba(255,113,108,0.08)] transition-colors disabled:opacity-40"
                    disabled={deletingInvoiceId === invoiceModal.id}
                    onClick={() => setDeletePinInvoice(invoiceModal)}
                  >
                    <Trash2 className="size-4" strokeWidth={2} aria-hidden />
                    Eliminar
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#59ee50] text-black font-['Inter',sans-serif] font-bold text-[13px] px-4 py-2.5 border-none cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => void printInvoice(invoiceModal)}
                  >
                    <Printer className="size-4" strokeWidth={2} aria-hidden />
                    Imprimir
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {deletePinInvoice ? (
        <PinGateModal
          correctPin={APP_ACCESS_PIN}
          title="Eliminar factura"
          subtitle={`Factura #${String(deletePinInvoice.numero_factura).padStart(4, "0")}. Ingresa la misma clave que en Soporte para borrar el registro y desvincular lineas de mesa.`}
          onUnlock={() => {
            const target = deletePinInvoice;
            setDeletePinInvoice(null);
            void deleteInvoiceAndTraces(target);
          }}
          onCancel={() => setDeletePinInvoice(null)}
        />
      ) : null}
    </div>
  );
}
