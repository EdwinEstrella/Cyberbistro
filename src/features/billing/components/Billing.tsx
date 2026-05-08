import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Eye, Printer, Trash2 } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { APP_ACCESS_PIN } from "../../../shared/lib/accessPin";
import { PinGateModal } from "../../../shared/components/PinGate";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
// useTheme removed
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
  categoryBreakdown: { category: string; count: number; total: number }[];
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
    hour12: true,
  });
}

function getMethodDisplay(method: string): { label: string; pillClass: string } {
  switch (method) {
    case "efectivo":
      return { label: "Efectivo", pillClass: "bg-green-500/10 text-green-500" };
    case "tarjeta":
      return { label: "Tarjeta", pillClass: "bg-blue-500/10 text-blue-400" };
    case "digital":
      return { label: "Digital", pillClass: "bg-orange-500/10 text-orange-400" };
    case "transferencia":
      return { label: "Transferencia", pillClass: "bg-purple-500/10 text-purple-400" };
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
  // theme was declared but never read
  const [view, setView] = useState<BillingView>("facturas");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cycles, setCycles] = useState<CierreOperativoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [invoiceModal, setInvoiceModal] = useState<Invoice | null>(null);
  const [deletePinInvoice, setDeletePinInvoice] = useState<Invoice | null>(null);
  // deletingInvoiceId removed
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
      const categoryMap = new Map<string, { count: number; total: number }>();
      
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

        if (Array.isArray(inv.items)) {
          for (const item of inv.items) {
            const cat = item.categoria || "General";
            const currentCat = categoryMap.get(cat) ?? { count: 0, total: 0 };
            currentCat.count += item.cantidad;
            currentCat.total += Number(item.subtotal || (item.cantidad * item.precio_unitario));
            categoryMap.set(cat, currentCat);
          }
        }
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
        categoryBreakdown: [...categoryMap.entries()].map(([category, data]) => ({ category, ...data })).sort((a, b) => b.total - a.total),
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

  const { totalRevenue, paidCount, cancelledCount } = useMemo(() => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentInvoices = invoices.filter(
      (inv) => new Date(inv.created_at) > last24h && inv.estado === "pagada"
    );
    return {
      totalRevenue: recentInvoices.reduce((sum, inv) => sum + inv.total, 0),
      paidCount: invoices.filter((inv) => inv.estado === "pagada").length,
      cancelledCount: invoices.filter((inv) => inv.estado === "cancelada").length,
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
  // totalPages removed
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

      const { error: consumosError } = await insforgeClient.database
        .from("consumos")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("factura_id", inv.id);

      if (consumosError) {
        console.error("Error al desvincular consumos de la factura:", consumosError);
        alert(`No se pudo limpiar consumos vinculados: ${consumosError.message}`);
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
        return;
      }

      setInvoiceModal((open) => (open?.id === inv.id ? null : open));
      await loadBillingData();
    },
    [tenantId, loadBillingData]
  );

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[16px]">
          Cargando sesion...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] max-w-md">
          Tu usuario no esta vinculado a un negocio.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[16px]">
          Cargando analiticas...
        </span>
      </div>
    );
  }

  // Define grid columns once to avoid duplication and syntax issues
  const gridColsClass = "grid grid-cols-[80px_100px_1fr_100px_120px_120px_120px]";

  return (
    <div className="flex-1 p-5 sm:p-8 lg:p-10 flex flex-col gap-6 sm:gap-8 lg:gap-10 overflow-auto max-w-[1600px] w-full mx-auto bg-background transition-colors duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="font-['Inter',sans-serif] text-[12px] uppercase tracking-[0.28em] text-primary">
            Analiticas operativas
          </div>
          <h1 className="font-['Space_Grotesk',sans-serif] text-foreground text-[30px] sm:text-[38px] font-bold leading-none">
            Facturas y ciclos
          </h1>
          <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] max-w-3xl leading-relaxed">
            Revisión de cobros y ciclos operativos cerrados.
          </p>
        </div>

        <div className="bg-muted rounded-2xl border border-black/5 dark:border-white/5 p-1.5 flex items-center gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setView("facturas")}
            className={`flex-1 sm:flex-none rounded-xl px-5 py-3 font-['Inter',sans-serif] text-[14px] font-semibold transition-colors ${
              view === "facturas" ? "bg-green-600 text-white" : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            Facturas
          </button>
          <button
            type="button"
            onClick={() => setView("ciclos")}
            className={`flex-1 sm:flex-none rounded-xl px-5 py-3 font-['Inter',sans-serif] text-[14px] font-semibold transition-colors ${
              view === "ciclos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            Ciclos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: view === "facturas" ? "Ingreso Total (24h)" : "Venta Total en Ciclos",
            value: (view === "facturas" ? totalRevenue : cycleKpis.totalCycleSales),
            isMoney: true,
            sub: view === "facturas" ? "Facturas recientes" : `${cycleKpis.totalCycles} ciclos`,
            color: "text-green-600 dark:text-green-400"
          },
          {
            label: view === "facturas" ? "Ticket Promedio" : "Ciclos Cerrados",
            value: view === "facturas" ? (invoices.length > 0 ? invoices.reduce((s, i) => s + i.total, 0) / invoices.length : 0) : cycleKpis.closedCycles,
            isMoney: view === "facturas",
            sub: view === "facturas" ? `${invoices.length} totales` : `${cycleKpis.activeCycles} activos`,
            color: "text-foreground"
          },
          {
            label: view === "facturas" ? "Facturas Pagadas" : "Facturas en Ciclos",
            value: view === "facturas" ? paidCount : filteredCycleSummaries.reduce((s, e) => s + e.invoices.length, 0),
            isMoney: false,
            sub: view === "facturas" ? `${cancelledCount} canceladas` : "Total en ciclos",
            color: "text-pink-600 dark:text-pink-400"
          },
          {
            label: view === "facturas" ? "Total Facturas" : "Mas Reciente",
            value: view === "facturas" ? invoices.length : (filteredCycleSummaries[0]?.cycle.cycle_number ?? "--"),
            isMoney: false,
            sub: view === "facturas" ? "En el sistema" : "Ultimo cierre",
            color: "text-primary"
          }
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-[18px] border border-black/10 dark:border-white/5 p-5 flex flex-col gap-3 min-h-[140px] shadow-sm">
            <div className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-wide uppercase font-bold">{kpi.label}</div>
            <div className={`font-['Space_Grotesk',sans-serif] font-bold text-[28px] tabular-nums ${kpi.color}`}>
              {kpi.isMoney ? RD(kpi.value as number) : kpi.value}
            </div>
            <div className="font-['Inter',sans-serif] text-muted-foreground text-[12px]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-card/50 backdrop-blur-[6px] rounded-2xl border border-black/10 dark:border-white/5 p-4 sm:p-5 flex flex-wrap items-center gap-4 sm:gap-5 justify-between">
        <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[14px] outline-none focus:border-primary transition-colors"
            />
            <span className="text-muted-foreground">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[14px] outline-none focus:border-primary transition-colors"
            />
          </div>

          {view === "facturas" && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[14px] outline-none cursor-pointer"
              >
                <option value="todos">Todos los Estados</option>
                <option value="pagada">Pagadas</option>
                <option value="cancelada">Canceladas</option>
              </select>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[14px] outline-none cursor-pointer"
              >
                <option value="todos">Todos los Metodos</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="digital">Digital</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </>
          )}
        </div>
        <button onClick={() => void loadBillingData()} className="bg-primary text-primary-foreground rounded-xl px-6 py-2.5 font-bold uppercase text-[12px] tracking-widest hover:opacity-90 transition-all">Actualizar</button>
      </div>

      {view === "facturas" ? (
        <div className="overflow-x-auto rounded-[24px] border border-black/10 dark:border-white/5 bg-card">
          <div className="min-w-[1000px]">
            <div className={`${gridColsClass} bg-muted/50 border-b border-black/10 dark:border-white/10 px-6 py-4`}>
              {["ID", "Fecha", "Mesa / Origen", "Metodo", "Estado", "Monto", "Acciones"].map((h, i) => (
                <div key={i} className={`font-['Inter',sans-serif] font-bold text-muted-foreground text-[11px] uppercase tracking-widest ${i >= 5 ? "text-right" : ""}`}>
                  {h}
                </div>
              ))}
            </div>

            <div className="divide-y divide-black/5 dark:divide-white/5">
              {pageData.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground font-['Inter']">No se encontraron facturas.</div>
              ) : (
                pageData.map((inv) => {
                  const status = statusConfig[inv.estado];
                  const method = getMethodDisplay(inv.metodo_pago);
                  const date = new Date(inv.created_at);
                  return (
                    <div key={inv.id} className={`${gridColsClass} px-6 py-5 items-center hover:bg-muted/30 transition-colors group`}>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground">#{String(inv.numero_factura).padStart(4, "0")}</span>
                      <div className="flex flex-col text-[13px]">
                        <span className="text-foreground font-medium">{date.toLocaleDateString()}</span>
                        <span className="text-muted-foreground text-[11px]">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-full flex items-center justify-center font-bold text-[11px] ${inv.mesa_numero ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-600 dark:text-green-400"}`}>
                          {inv.mesa_numero ? String(inv.mesa_numero).padStart(2, "0") : "PL"}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-foreground text-[14px] font-medium">{inv.mesa_numero ? `Mesa ${inv.mesa_numero}` : "Para llevar"}</span>
                          <span className="text-muted-foreground text-[11px]">{itemCount(inv)} productos</span>
                        </div>
                      </div>
                      <div><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${method.pillClass}`}>{method.label}</span></div>
                      <div>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-black/5 dark:border-white/5 w-fit bg-muted/50">
                           <div className="size-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                           <span className="text-[10px] font-bold uppercase" style={{ color: status.color }}>{status.label}</span>
                        </div>
                      </div>
                      <div className="text-right font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[16px] tabular-nums">{RD(inv.total)}</div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setInvoiceModal(inv)} className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all border-none cursor-pointer"><Eye size={16} /></button>
                        <button onClick={() => void printInvoice(inv)} className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all border-none cursor-pointer"><Printer size={16} /></button>
                        <button onClick={() => setDeletePinInvoice(inv)} className="size-8 rounded-lg bg-muted flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all border-none cursor-pointer"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {filteredCycleSummaries.map((entry) => (
             <div key={entry.cycle.id} className="bg-card rounded-[24px] border border-black/10 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="p-6 sm:p-8 flex flex-col gap-6">
                   <div className="flex flex-col lg:flex-row justify-between gap-6">
                      <div className="space-y-2">
                         <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ciclo #{entry.cycle.cycle_number}</span>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${entry.cycle.closed_at ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>
                               {entry.cycle.closed_at ? "Cerrado" : "Abierto"}
                            </span>
                         </div>
                         <h2 className="font-['Space_Grotesk',sans-serif] text-[28px] font-bold text-foreground">Día {entry.cycle.business_day}</h2>
                         <p className="text-muted-foreground text-[14px]">Operación: {formatDateTime(entry.cycle.opened_at)} - {formatDateTime(entry.cycle.closed_at)}</p>
                      </div>
                      <div className="flex gap-4">
                         {[
                           { label: "Vendido", val: RD(entry.totalSold), color: "text-foreground" },
                           { label: "Facturas", val: entry.invoices.length, color: "text-foreground" },
                           { label: "Promedio", val: RD(entry.avgTicket), color: "text-primary" }
                         ].map((st, j) => (
                           <div key={j} className="bg-muted/50 rounded-2xl px-6 py-4 border border-black/5 dark:border-white/5">
                              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{st.label}</div>
                              <div className={`font-['Space_Grotesk',sans-serif] text-[20px] font-bold tabular-nums ${st.color}`}>{st.val}</div>
                           </div>
                         ))}
                      </div>
                   </div>

                   <button onClick={() => setExpandedCycleId(expandedCycleId === entry.cycle.id ? null : entry.cycle.id)} className="flex items-center gap-2 text-primary font-bold text-[13px] uppercase tracking-wider hover:opacity-80 transition-all border-none bg-transparent cursor-pointer">
                      {expandedCycleId === entry.cycle.id ? "Ocultar detalle" : "Ver detalle de ventas"}
                      <ChevronDown size={16} className={`transition-transform ${expandedCycleId === entry.cycle.id ? "rotate-180" : ""}`} />
                   </button>
                   
                   {expandedCycleId === entry.cycle.id && (
                     <div className="pt-6 mt-2 border-t border-black/10 dark:border-white/5 animate-in fade-in slide-in-from-top-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Por Categoria</div>
                          <div className="space-y-3">
                             {entry.categoryBreakdown.length > 0 ? entry.categoryBreakdown.map((cat, idx) => (
                               <div key={idx} className="flex justify-between items-center p-3 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                                 <div className="flex flex-col">
                                    <span className="text-foreground font-medium text-[14px]">{cat.category}</span>
                                    <span className="text-muted-foreground text-[11px]">{cat.count} productos</span>
                                 </div>
                                 <span className="font-bold text-[14px]">{RD(cat.total)}</span>
                               </div>
                             )) : (
                               <div className="text-muted-foreground text-[13px] italic">No hay productos vendidos en este ciclo.</div>
                             )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Por Metodo de Pago</div>
                          <div className="space-y-3">
                             {entry.methodBreakdown.length > 0 ? entry.methodBreakdown.map((met, idx) => (
                               <div key={idx} className="flex justify-between items-center p-3 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                                 <div className="flex flex-col">
                                    <span className="text-foreground font-medium text-[14px]">{met.label}</span>
                                    <span className="text-muted-foreground text-[11px]">{met.count} facturas</span>
                                 </div>
                                 <span className="font-bold text-[14px]">{RD(met.total)}</span>
                               </div>
                             )) : (
                               <div className="text-muted-foreground text-[13px] italic">No hay cobros en este ciclo.</div>
                             )}
                          </div>
                        </div>
                     </div>
                   )}
                </div>
             </div>
          ))}
        </div>
      )}

      {/* MODALS maintained exactly with same logic but theme classes */}
      <Dialog open={invoiceModal !== null} onOpenChange={(open) => !open && setInvoiceModal(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-black/10 dark:border-white/10 bg-card text-foreground sm:max-w-lg">
          {invoiceModal && (
            <>
              <DialogHeader>
                <DialogTitle className="font-['Space_Grotesk',sans-serif] text-xl">Factura #{String(invoiceModal.numero_factura).padStart(4, "0")}</DialogTitle>
                <DialogDescription className="text-muted-foreground">{formatDateTime(invoiceModal.created_at)} · {invoiceModal.mesa_numero ? `Mesa ${invoiceModal.mesa_numero}` : "Para llevar"}</DialogDescription>
              </DialogHeader>
              {/* Detailed view logic remains identical */}
              <div className="flex gap-4 py-4 border-y border-border">
                 <div className="flex-1">
                    <div className="text-[11px] font-bold text-muted-foreground uppercase mb-1">Items</div>
                    <div className="space-y-2">
                       {invoiceModal.items.map((it, i) => (
                         <div key={i} className="flex justify-between text-[14px]">
                            <div className="flex flex-col">
                               <span>{it.cantidad}× {it.nombre}</span>
                               <span className="text-[10px] text-muted-foreground uppercase">{it.categoria || "General"}</span>
                            </div>
                            <span className="font-bold">{RD(it.subtotal)}</span>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="space-y-2 py-4">
                 <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{RD(invoiceModal.subtotal)}</span></div>
                 <div className="flex justify-between text-muted-foreground"><span>ITBIS (18%)</span><span>{RD(invoiceModal.itbis)}</span></div>
                 <div className="flex justify-between text-foreground font-bold text-[18px] pt-2 border-t"><span>Total</span><span>{RD(invoiceModal.total)}</span></div>
              </div>
              <div className="flex gap-3 pt-4">
                 <button onClick={() => void printInvoice(invoiceModal)} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-bold uppercase text-[12px] tracking-widest hover:opacity-90 border-none cursor-pointer">Reimprimir</button>
                 <button onClick={() => setInvoiceModal(null)} className="flex-1 bg-muted text-foreground py-3 rounded-xl font-bold uppercase text-[12px] tracking-widest hover:bg-black/5 dark:hover:bg-white/10 border-none cursor-pointer">Cerrar</button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {deletePinInvoice && (
        <PinGateModal
          correctPin={APP_ACCESS_PIN}
          title="Eliminar factura"
          subtitle={`Factura #${String(deletePinInvoice.numero_factura).padStart(4, "0")}. Requiere clave de soporte.`}
          onUnlock={() => {
            const target = deletePinInvoice;
            setDeletePinInvoice(null);
            void deleteInvoiceAndTraces(target);
          }}
          onCancel={() => setDeletePinInvoice(null)}
        />
      )}
    </div>
  );
}
