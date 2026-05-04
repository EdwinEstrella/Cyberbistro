import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Eye, Printer, Trash2 } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { APP_ACCESS_PIN } from "../../../shared/lib/accessPin";
import { PinGateModal } from "../../../shared/components/PinGate";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { useTheme } from "../../../shared/context/ThemeContext";
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
  pagada: { label: "PAGADA", color: "#15803d", bg: "rgba(21,128,61,0.1)", shadow: "0px 0px 15px 0px rgba(21,128,61,0.1)" },
  pendiente: { label: "PENDIENTE", color: "#ff906d", bg: "rgba(255,144,109,0.1)" },
  cancelada: { label: "CANCELADA", color: "#d4183d", bg: "rgba(212,24,61,0.1)" },
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



function getMethodDisplay(method: string, isDark: boolean): { label: string; pillClass: string } {
  switch (method) {
    case "efectivo":
      return { label: "Efectivo", pillClass: "bg-[#15803d]/10 text-[#15803d]" };
    case "tarjeta":
      return { label: "Tarjeta", pillClass: isDark ? "bg-[#93c5fd]/10 text-[#93c5fd]" : "bg-blue-100 text-blue-700" };
    case "digital":
      return { label: "Digital", pillClass: "bg-primary/10 text-primary" };
    case "transferencia":
      return { label: "Transferencia", pillClass: isDark ? "bg-[#c4b5fd]/10 text-[#c4b5fd]" : "bg-purple-100 text-purple-700" };
    default:
      return { label: method, pillClass: "bg-muted text-muted-foreground" };
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
        const display = getMethodDisplay(inv.metodo_pago, isDark);
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
  }, [cycles, invoices, isDark]);

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
      <div className="flex-1 flex items-center justify-center bg-background transition-colors duration-300">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[16px]">
          Cargando sesion...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background transition-colors duration-300">
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] text-center max-w-md">
          Tu usuario no esta vinculado a un negocio. Las analiticas solo muestran facturas de tu
          negocio.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background transition-colors duration-300">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[16px]">
          Cargando analiticas...
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-5 sm:p-8 lg:p-10 flex flex-col gap-6 sm:gap-8 lg:gap-10 overflow-auto max-w-[1600px] w-full mx-auto bg-background transition-colors duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="font-['Inter',sans-serif] text-[12px] uppercase tracking-[0.28em] text-primary font-bold">
            Analiticas operativas
          </div>
          <h1 className={`font-['Space_Grotesk',sans-serif] text-[30px] sm:text-[38px] font-bold leading-none ${isDark ? "text-white" : "text-black"}`}>
            Facturas y ciclos
          </h1>
          <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] max-w-3xl leading-relaxed">
            En facturas ves el detalle de cobros. En ciclos puedes revisar cada cierre enumerado,
            cuanto vendio y desde que hora hasta que hora opero.
          </p>
        </div>

        <div className={`rounded-2xl border p-1.5 flex items-center gap-1 w-full sm:w-auto ${isDark ? "bg-card border-white/5" : "bg-muted border-black/10"}`}>
          <button
            type="button"
            onClick={() => setView("facturas")}
            className={`flex-1 sm:flex-none rounded-xl px-5 py-3 font-['Inter',sans-serif] text-[14px] font-bold transition-all ${
              view === "facturas"
                ? "bg-[#15803d] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Facturas
          </button>
          <button
            type="button"
            onClick={() => setView("ciclos")}
            className={`flex-1 sm:flex-none rounded-xl px-5 py-3 font-['Inter',sans-serif] text-[14px] font-bold transition-all ${
              view === "ciclos"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ciclos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title={view === "facturas" ? "Ingreso Total (24h)" : "Venta Total en Ciclos"} value={(view === "facturas" ? totalRevenue : cycleKpis.totalCycleSales).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} accent={isDark ? "#59ee50" : "#15803d"} subtitle={view === "facturas" ? "Facturas recientes" : `${cycleKpis.totalCycles} ciclos listados`} isDark={isDark} />
        <StatCard title={view === "facturas" ? "Ticket Promedio" : "Ciclos Cerrados"} value={view === "facturas" ? (invoices.length > 0 ? invoices.reduce((sum, inv) => sum + inv.total, 0) / invoices.length : 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : cycleKpis.closedCycles.toString()} accent={isDark ? "white" : "black"} subtitle={view === "facturas" ? `${invoices.length} facturas totales` : `${cycleKpis.activeCycles} ciclos activos`} isDark={isDark} />
        <StatCard title={view === "facturas" ? "Facturas Pendientes" : "Facturas en Ciclos"} value={(view === "facturas" ? pendingCount : filteredCycleSummaries.reduce((sum, entry) => sum + entry.invoices.length, 0)).toString()} accent="#d4183d" subtitle={view === "facturas" ? `${RD(pendingAmount)} en espera` : `${filteredCycleSummaries.reduce((sum, entry) => sum + entry.pendingInvoices.length, 0)} pendientes dentro de ciclos`} isDark={isDark} />
        <StatCard title={view === "facturas" ? "Total Facturas" : "Cierre Mas Reciente"} value={view === "facturas" ? invoices.length.toString() : (filteredCycleSummaries[0]?.cycle.cycle_number != null ? `#${filteredCycleSummaries[0].cycle.cycle_number}` : "--")} accent={isDark ? "#ff906d" : "var(--primary)"} subtitle={view === "facturas" ? "Registradas en el sistema" : (filteredCycleSummaries[0] ? formatDateTime(filteredCycleSummaries[0].cycle.closed_at ?? filteredCycleSummaries[0].cycle.opened_at) : "Sin cierres todavia")} isDark={isDark} />
      </div>

      <div className={`backdrop-blur-[6px] rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center gap-4 sm:gap-5 justify-between ${isDark ? "bg-card border-white/5" : "bg-muted border-black/10 shadow-sm"}`}>
        <div className="flex flex-wrap gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="flex items-center gap-2">
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`rounded-xl border px-4 py-3 min-h-[44px] font-['Inter',sans-serif] text-[14px] cursor-pointer outline-none transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-white border-black text-black focus:border-primary"}`}
              title="Desde"
            />
            <span className="font-['Inter',sans-serif] text-muted-foreground text-[13px] shrink-0 font-bold">a</span>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`rounded-xl border px-4 py-3 min-h-[44px] font-['Inter',sans-serif] text-[14px] cursor-pointer outline-none transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-white border-black text-black focus:border-primary"}`}
              title="Hasta"
            />
          </div>

          {view === "facturas" ? (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`rounded-xl border px-5 py-3 min-h-[44px] font-['Inter',sans-serif] text-[15px] cursor-pointer outline-none transition-colors ${isDark ? "bg-background border-white/10 text-white" : "bg-white border-black text-black"}`}
              >
                <option value="todos">Todos los Estados</option>
                <option value="pagada">Pagadas</option>
                <option value="pendiente">Pendientes</option>
                <option value="cancelada">Canceladas</option>
              </select>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className={`rounded-xl border px-5 py-3 min-h-[44px] font-['Inter',sans-serif] text-[15px] cursor-pointer outline-none transition-colors ${isDark ? "bg-background border-white/10 text-white" : "bg-white border-black text-black"}`}
              >
                <option value="todos">Todos los Metodos</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="digital">Digital</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </>
          ) : null}
        </div>

        <button
          onClick={() => void loadBillingData()}
          className={`rounded-xl border flex gap-2 items-center px-6 py-3 min-h-[44px] font-bold cursor-pointer transition-all ${isDark ? "bg-muted border-white/10 text-white hover:bg-muted/80" : "bg-white border-black text-black hover:bg-muted"}`}
        >
          <span className="font-['Inter',sans-serif] text-[15px]">Actualizar</span>
        </button>
      </div>

      {view === "facturas" ? (
        <div className="overflow-x-auto rounded-[24px] shadow-sm">
          <div className={`rounded-[24px] border overflow-hidden min-w-[920px] ${isDark ? "bg-card border-white/5" : "bg-white border-black"}`}>
            <div className={`grid grid-cols-[minmax(7rem,8rem)_minmax(8.5rem,10rem)_minmax(11rem,1.2fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_minmax(9rem,11rem)_minmax(9.5rem,11rem)] px-6 sm:px-10 gap-x-4 ${isDark ? "bg-muted/20" : "bg-muted/30"}`}>
              {["Factura", "Fecha", "Mesa", "Metodo", "Estado", "Monto", "Acciones"].map((h, i) => (
                <div key={i} className={`py-6 ${i >= 5 ? "text-right" : ""}`}>
                  <span className="font-['Inter',sans-serif] font-bold text-muted-foreground text-[11px] sm:text-xs tracking-[0.12em] uppercase whitespace-pre-line leading-relaxed block">
                    {h}
                  </span>
                </div>
              ))}
            </div>

            {pageData.length === 0 ? (
              <div className="px-10 py-16 text-center">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[15px]">
                  No se encontraron facturas
                </span>
              </div>
            ) : (
              pageData.map((inv, idx) => {
                const status = statusConfig[inv.estado];
                const method = getMethodDisplay(inv.metodo_pago, isDark);
                const date = new Date(inv.created_at);
                return (
                  <div
                    key={inv.id}
                    className={`grid grid-cols-[minmax(7rem,8rem)_minmax(8.5rem,10rem)_minmax(11rem,1.2fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_minmax(9rem,11rem)_minmax(9.5rem,11rem)] px-6 sm:px-10 gap-x-4 items-center hover:bg-muted/10 transition-colors ${idx > 0 ? "border-t border-black/5 dark:border-white/5" : ""}`}
                  >
                    <div className="py-9">
                      <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[17px] tabular-nums ${isDark ? "text-white" : "text-black"}`}>
                        #{String(inv.numero_factura).padStart(4, "0")}
                      </span>
                    </div>
                    <div className="py-9 space-y-1.5">
                      <div className={`font-['Inter',sans-serif] text-[15px] font-medium leading-snug ${isDark ? "text-muted-foreground" : "text-black"}`}>
                        {date.toLocaleDateString("es-DO")}
                      </div>
                      <div className="font-['Inter',sans-serif] text-muted-foreground text-[13px] opacity-60">
                        {date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="py-9 flex gap-4 items-center min-w-0">
                      <div
                        className="rounded-lg flex items-center justify-center h-9 px-2.5 min-w-[2.25rem] shrink-0 border border-black/5 dark:border-white/5"
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
                              inv.mesa_numero != null && inv.mesa_numero !== 0 ? "#ff906d" : "#15803d",
                          }}
                        >
                          {inv.mesa_numero != null && inv.mesa_numero !== 0
                            ? String(inv.mesa_numero).padStart(2, "0")
                            : "PL"}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className={`font-['Inter',sans-serif] font-bold text-[15px] leading-snug ${isDark ? "text-white" : "text-black"}`}>
                          {inv.mesa_numero != null && inv.mesa_numero !== 0
                            ? `Mesa ${inv.mesa_numero}`
                            : "Para llevar"}
                        </div>
                        <div className="font-['Inter',sans-serif] text-muted-foreground text-[12px] font-medium uppercase">
                          {itemCount(inv)} productos
                        </div>
                      </div>
                    </div>
                    <div className="py-9 flex items-center">
                      <span
                        className={`font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md shrink-0 border border-black/5 dark:border-white/5 ${method.pillClass}`}
                      >
                        {method.label}
                      </span>
                    </div>
                    <div className="py-9">
                      <div
                        className={`flex gap-2 items-center px-3.5 py-2 rounded-full w-fit max-w-full border ${isDark ? "border-white/5" : "border-black/5"}`}
                        style={{ backgroundColor: status.bg }}
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
                        className={`font-['Space_Grotesk',sans-serif] font-bold text-[19px] tabular-nums inline-block ${inv.estado === "cancelada" ? "text-destructive" : (isDark ? "text-white" : "text-black")}`}
                      >
                        {RD(inv.total)}
                      </span>
                    </div>
                    <div className="py-9 flex gap-3 justify-end">
                      <button
                        className={`rounded-lg size-10 flex items-center justify-center border transition-colors shrink-0 ${isDark ? "bg-muted border-white/10 text-white hover:bg-muted/80" : "bg-white border-black text-black hover:bg-muted"}`}
                        title="Ver factura"
                        type="button"
                        onClick={() => setInvoiceModal(inv)}
                      >
                        <Eye className="size-[18px]" strokeWidth={2} />
                      </button>
                      <button
                        className={`rounded-lg size-10 flex items-center justify-center border transition-colors shrink-0 ${isDark ? "bg-muted border-white/10 text-white hover:bg-muted/80" : "bg-white border-black text-black hover:bg-muted"}`}
                        title="Imprimir factura"
                        type="button"
                        onClick={() => void printInvoice(inv)}
                      >
                        <Printer className="size-[18px]" strokeWidth={2} />
                      </button>
                      <button
                        className={`rounded-lg size-10 flex items-center justify-center border transition-colors shrink-0 ${isDark ? "bg-muted border-white/10 text-destructive hover:bg-destructive/10" : "bg-white border-black text-destructive hover:bg-destructive/5"}`}
                        title="Eliminar factura"
                        type="button"
                        disabled={deletingInvoiceId === inv.id}
                        onClick={() => setDeletePinInvoice(inv)}
                      >
                        <Trash2 className="size-[18px]" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {filteredInvoices.length > 0 && (
              <div className="border-t border-black/5 dark:border-white/5 px-6 sm:px-10 py-6 flex flex-wrap items-center gap-4 justify-between">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[15px] leading-relaxed">
                  Mostrando{" "}
                  <span className={`font-bold tabular-nums ${isDark ? "text-white" : "text-black"}`}>
                    {startIndex + 1} - {Math.min(endIndex, filteredInvoices.length)}
                  </span>{" "}
                  de <span className={`font-bold tabular-nums ${isDark ? "text-white" : "text-black"}`}>{filteredInvoices.length}</span> facturas
                </span>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    type="button"
                    className={`size-10 rounded-lg flex items-center justify-center border cursor-pointer disabled:opacity-50 transition-colors ${isDark ? "bg-muted border-white/10 text-white hover:bg-muted/80" : "bg-white border-black text-black hover:bg-muted"}`}
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
                        className={`size-10 rounded-lg flex items-center justify-center border cursor-pointer font-['Inter',sans-serif] font-bold text-[13px] transition-all ${
                          currentPage === pageNum ? "bg-[#15803d] text-white border-[#15803d]" : (isDark ? "bg-muted border-white/10 text-white/50 hover:bg-muted/80" : "bg-white border-black text-black/50 hover:bg-muted")
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {totalPages > 3 && currentPage < totalPages - 1 && (
                    <span className="font-['Inter',sans-serif] text-muted-foreground text-sm px-1 font-bold">...</span>
                  )}
                  {totalPages > 3 && (
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      className={`size-10 rounded-lg flex items-center justify-center border cursor-pointer font-['Inter',sans-serif] font-bold text-[13px] transition-all ${
                        currentPage === totalPages ? "bg-[#15803d] text-white border-[#15803d]" : (isDark ? "bg-muted border-white/10 text-white/50 hover:bg-muted/80" : "bg-white border-black text-black/50 hover:bg-muted")
                      }`}
                    >
                      {totalPages}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className={`size-10 rounded-lg flex items-center justify-center border cursor-pointer disabled:opacity-50 transition-colors ${isDark ? "bg-muted border-white/10 text-white hover:bg-muted/80" : "bg-white border-black text-black hover:bg-muted"}`}
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
            <div className={`rounded-[24px] border px-8 py-14 text-center ${isDark ? "bg-card border-white/5" : "bg-white border-black shadow-sm"}`}>
              <div className={`font-['Space_Grotesk',sans-serif] text-[24px] font-bold ${isDark ? "text-white" : "text-black"}`}>
                No hay ciclos para mostrar
              </div>
              <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] mt-2 font-medium">
                Ajusta el rango de fechas o crea cierres operativos para ver el historial.
              </p>
            </div>
          ) : (
            filteredCycleSummaries.map((entry, index) => {
              const { cycle } = entry;
              const isExpanded = expandedCycleId === cycle.id;
              const cycleStateLabel = cycle.closed_at ? "Cerrado" : "Abierto";
              const cycleStateClass = cycle.closed_at
                ? "bg-[#15803d]/10 text-[#15803d] border-[#15803d]/20"
                : "bg-primary/10 text-primary border-primary/20";

              return (
                <div
                  key={cycle.id}
                  className={`rounded-[24px] border overflow-hidden transition-all ${isDark ? "bg-card border-white/5" : "bg-white border-black shadow-sm"}`}
                >
                  <div className="p-5 sm:p-7 flex flex-col gap-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-bold">
                            Ciclo enumerado {String(index + 1).padStart(2, "0")}
                          </div>
                          <span className={`px-3 py-1 rounded-full border font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide ${cycleStateClass}`}>
                            {cycleStateLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <h2 className={`font-['Space_Grotesk',sans-serif] text-[26px] font-bold leading-none ${isDark ? "text-white" : "text-black"}`}>
                            Ciclo #{cycle.cycle_number}
                          </h2>
                          <span className="font-['Inter',sans-serif] text-muted-foreground text-[14px] font-medium">
                            Dia operativo {cycle.business_day}
                          </span>
                        </div>
                        <p className={`font-['Inter',sans-serif] text-[14px] leading-relaxed max-w-3xl font-medium ${isDark ? "text-muted-foreground" : "text-black/70"}`}>
                          Opero desde {formatDateTime(cycle.opened_at)} hasta {formatDateTime(cycle.closed_at)}.
                          {entry.firstSaleAt
                            ? ` Vendio desde ${formatDateTime(entry.firstSaleAt)} hasta ${formatDateTime(entry.lastSaleAt)}.`
                            : " No tuvo ventas registradas."}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 lg:justify-end">
                        <div className={`min-w-[150px] rounded-2xl border px-4 py-3 ${isDark ? "bg-background/40 border-white/5" : "bg-muted/30 border-black/5"}`}>
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
                            Vendido
                          </div>
                          <div className={`font-['Space_Grotesk',sans-serif] text-[24px] font-bold mt-2 ${isDark ? "text-white" : "text-black"}`}>
                            {RD(entry.totalSold)}
                          </div>
                        </div>
                        <div className={`min-w-[150px] rounded-2xl border px-4 py-3 ${isDark ? "bg-background/40 border-white/5" : "bg-muted/30 border-black/5"}`}>
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
                            Facturas
                          </div>
                          <div className={`font-['Space_Grotesk',sans-serif] text-[24px] font-bold mt-2 ${isDark ? "text-white" : "text-black"}`}>
                            {entry.invoices.length}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
                      <div className={`rounded-[20px] border p-4 sm:p-5 ${isDark ? "bg-background/30 border-white/5" : "bg-muted/20 border-black/5"}`}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                              Rango del ciclo
                            </div>
                            <div className={`font-['Inter',sans-serif] font-bold text-[15px] mt-1 ${isDark ? "text-white" : "text-black"}`}>
                              Apertura y cierre operativo
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className={`rounded-2xl border px-4 py-4 ${isDark ? "bg-background border-white/5" : "bg-white border-black/5"}`}>
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
                              Inicio
                            </div>
                            <div className={`font-['Space_Grotesk',sans-serif] text-[18px] font-bold mt-2 ${isDark ? "text-white" : "text-black"}`}>
                              {formatDateTime(cycle.opened_at)}
                            </div>
                          </div>
                          <div className={`rounded-2xl border px-4 py-4 ${isDark ? "bg-background border-white/5" : "bg-white border-black/5"}`}>
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
                              Fin
                            </div>
                            <div className={`font-['Space_Grotesk',sans-serif] text-[18px] font-bold mt-2 ${isDark ? "text-white" : "text-black"}`}>
                              {formatDateTime(cycle.closed_at)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-[20px] border p-4 sm:p-5 ${isDark ? "bg-background/30 border-white/5" : "bg-muted/20 border-black/5"}`}>
                        <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                          Resumen del cierre
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className={`rounded-2xl border px-4 py-4 ${isDark ? "bg-background border-white/5" : "bg-white border-black/5"}`}>
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
                              Subtotal
                            </div>
                            <div className={`font-['Space_Grotesk',sans-serif] text-[18px] font-bold mt-2 ${isDark ? "text-white" : "text-black"}`}>
                              {RD(entry.subtotalSold)}
                            </div>
                          </div>
                          <div className={`rounded-2xl border px-4 py-4 ${isDark ? "bg-background border-white/5" : "bg-white border-black/5"}`}>
                            <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
                              ITBIS
                            </div>
                            <div className={`font-['Space_Grotesk',sans-serif] text-[18px] font-bold mt-2 ${isDark ? "text-white" : "text-black"}`}>
                              {RD(entry.taxSold)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-[20px] border p-4 sm:p-5 ${isDark ? "bg-background/30 border-white/5" : "bg-muted/20 border-black/5"}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                            Metodos de pago
                          </div>
                          <div className={`font-['Inter',sans-serif] font-bold text-[15px] mt-1 ${isDark ? "text-white" : "text-black"}`}>
                            Distribucion de lo vendido en el ciclo
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedCycleId(isExpanded ? null : cycle.id)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 font-['Inter',sans-serif] text-[13px] font-bold transition-colors ${isDark ? "bg-background border-white/10 text-white hover:border-primary/50" : "bg-white border-black text-black hover:bg-muted"}`}
                        >
                          {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                          <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>

                      {entry.methodBreakdown.length === 0 ? (
                        <div className={`mt-4 rounded-2xl border px-4 py-5 font-['Inter',sans-serif] text-muted-foreground text-[14px] font-medium ${isDark ? "bg-background border-white/5" : "bg-white border-black/5"}`}>
                          Sin ventas pagadas en este ciclo.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                          {entry.methodBreakdown.map((method) => {
                            const display = getMethodDisplay(method.method, isDark);
                            return (
                              <div
                                key={`${cycle.id}-${method.method}`}
                                className={`rounded-2xl border px-4 py-4 ${isDark ? "bg-background border-white/5" : "bg-white border-black/5 shadow-sm"}`}
                              >
                                <span
                                  className={`inline-flex rounded-md px-2.5 py-1 font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide border border-black/5 ${display.pillClass}`}
                                >
                                  {method.label}
                                </span>
                                <div className={`font-['Space_Grotesk',sans-serif] text-[20px] font-bold mt-3 ${isDark ? "text-white" : "text-black"}`}>
                                  {RD(method.total)}
                                </div>
                                <div className="font-['Inter',sans-serif] text-muted-foreground text-[13px] mt-1 font-medium">
                                  {method.count} facturas
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <Dialog open={invoiceModal !== null} onOpenChange={(open) => !open && setInvoiceModal(null)}>
        <DialogContent className={`max-h-[85vh] overflow-y-auto border-none sm:max-w-lg ${isDark ? "bg-[#201f1f] text-white" : "bg-white text-black"}`}>
          {invoiceModal ? (
            <>
              <DialogHeader>
                <DialogTitle className={`font-['Space_Grotesk',sans-serif] text-xl ${isDark ? "text-white" : "text-black"}`}>
                  Factura #{String(invoiceModal.numero_factura).padStart(4, "0")}
                </DialogTitle>
                <DialogDescription className="font-['Inter',sans-serif] text-muted-foreground text-left font-medium">
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
                    const md = getMethodDisplay(invoiceModal.metodo_pago, isDark);
                    return (
                      <>
                        <div
                          className="flex gap-2 items-center px-3 py-1.5 rounded-full w-fit border border-black/5"
                          style={{ backgroundColor: st.bg }}
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
                          className={`font-['Inter',sans-serif] text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border border-black/5 ${md.pillClass}`}
                        >
                          {md.label}
                        </span>
                      </>
                    );
                  })()}
                </div>

                <div className={`rounded-xl border overflow-hidden ${isDark ? "border-white/10" : "border-black/10 shadow-sm"}`}>
                  <div className={`grid grid-cols-[2.5rem_1fr_auto] gap-2 px-3 py-2 font-['Inter',sans-serif] text-[10px] font-bold uppercase tracking-wide text-muted-foreground ${isDark ? "bg-muted/40" : "bg-muted/50"}`}>
                    <span>Cant.</span>
                    <span>Producto</span>
                    <span className="text-right">Subtotal</span>
                  </div>
                  <ul className={`divide-y m-0 p-0 list-none ${isDark ? "divide-white/5 bg-background/30" : "divide-black/5 bg-white"}`}>
                    {(Array.isArray(invoiceModal.items) ? invoiceModal.items : []).map((line, i) => (
                      <li key={`${line.plato_id}-${i}`} className="grid grid-cols-[2.5rem_1fr_auto] gap-2 px-3 py-2.5 text-[14px]">
                        <span className={`font-['Space_Grotesk',sans-serif] tabular-nums font-bold ${isDark ? "text-white" : "text-black"}`}>{line.cantidad}</span>
                        <span className="min-w-0 space-y-1">
                          <span className={`block font-['Inter',sans-serif] font-medium break-words ${isDark ? "text-white/90" : "text-black/90"}`}>
                            {line.nombre}
                          </span>
                          <span className="inline-flex max-w-full rounded-md bg-primary/10 px-2 py-0.5 font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide text-primary border border-primary/10">
                            <span className="truncate">{line.categoria?.trim() || "General"}</span>
                          </span>
                        </span>
                        <span className={`font-['Space_Grotesk',sans-serif] tabular-nums font-bold text-right shrink-0 ${isDark ? "text-white" : "text-black"}`}>
                          {RD(line.subtotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`space-y-1.5 font-['Inter',sans-serif] text-[14px] text-muted-foreground font-medium`}>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className={`font-bold tabular-nums ${isDark ? "text-white" : "text-black"}`}>{RD(invoiceModal.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ITBIS</span>
                    <span className={`font-bold tabular-nums ${isDark ? "text-white" : "text-black"}`}>{RD(invoiceModal.itbis)}</span>
                  </div>
                  {invoiceModal.propina > 0 ? (
                    <div className="flex justify-between">
                      <span>Propina</span>
                      <span className={`font-bold tabular-nums ${isDark ? "text-white" : "text-black"}`}>{RD(invoiceModal.propina)}</span>
                    </div>
                  ) : null}
                  <div className={`flex justify-between pt-2 border-t font-['Space_Grotesk',sans-serif] font-bold text-[17px] ${isDark ? "border-white/10 text-white" : "border-black/10 text-black"}`}>
                    <span>Total</span>
                    <span className="tabular-nums">{RD(invoiceModal.total)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-between gap-3 pt-2">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 rounded-lg border font-['Inter',sans-serif] font-bold text-[13px] px-4 py-2.5 cursor-pointer transition-all ${isDark ? "bg-transparent border-destructive/40 text-destructive hover:bg-destructive/10" : "bg-white border-destructive/60 text-destructive hover:bg-destructive/5"}`}
                    disabled={deletingInvoiceId === invoiceModal.id}
                    onClick={() => setDeletePinInvoice(invoiceModal)}
                  >
                    <Trash2 className="size-4" strokeWidth={2} />
                    Eliminar
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#15803d] text-white font-['Inter',sans-serif] font-bold text-[13px] px-4 py-2.5 border-none cursor-pointer hover:opacity-90 transition-all shadow-sm"
                    onClick={() => void printInvoice(invoiceModal)}
                  >
                    <Printer className="size-4" strokeWidth={2} />
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

function StatCard({
  title,
  value,
  accent,
  subtitle,
  isDark,
}: {
  title: string;
  value: string;
  accent?: string;
  subtitle?: string;
  isDark: boolean;
}) {
  return (
    <div className={`rounded-[18px] border p-5 flex flex-col gap-3 min-h-[140px] shadow-sm relative overflow-hidden transition-all ${isDark ? "bg-card border-white/5" : "bg-white border-black"}`}>
      <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-wide uppercase font-bold">
        {title}
      </div>
      <div
        className="font-['Space_Grotesk',sans-serif] font-bold text-[28px] tracking-tight leading-none tabular-nums"
        style={{ color: accent ?? "var(--foreground)" }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="flex gap-2 items-center mt-auto">
          <span className={`font-['Inter',sans-serif] font-bold text-[12px] leading-snug ${isDark ? "text-white/60" : "text-black/60"}`}>
            {subtitle}
          </span>
        </div>
      )}
      <div className="absolute bg-primary/5 blur-[32px] right-[-16px] rounded-full size-[80px] top-[-16px] pointer-events-none" />
    </div>
  );
}
