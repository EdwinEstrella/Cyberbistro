import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Eye, Printer, Trash2 } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { buildCierreDiaReceiptHtml, buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { readLocalMirror, enqueueLocalWrite, getDeviceId, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
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
  created_at: string;
}

interface ExpenseCategory {
  id: string;
  nombre: string;
  color?: string | null;
}

interface Expense {
  id: string;
  tenant_id?: string;
  category_id: string | null;
  cycle_id: string | null;
  descripcion: string;
  proveedor: string | null;
  monto: number;
  metodo_pago: string | null;
  fecha_gasto: string;
  notas: string | null;
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
  expenses: Expense[];
  totalSold: number;
  totalExpenses: number;
  netTotal: number;
  subtotalSold: number;
  taxSold: number;
  avgTicket: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  methodBreakdown: CycleMethodSummary[];
  categoryBreakdown: { category: string; count: number; total: number }[];
  expenseCategoryBreakdown: { category: string; count: number; total: number; color?: string | null }[];
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

function getCycleStartIso(cycle: Pick<CierreOperativoRow, "opened_at" | "created_at">): string {
  return new Date(cycle.created_at).getTime() < new Date(cycle.opened_at).getTime()
    ? cycle.created_at
    : cycle.opened_at;
}

function getInvoiceCycleIso(invoice: Pick<Invoice, "estado" | "created_at" | "pagada_at">): string {
  return invoice.estado === "pagada" && invoice.pagada_at ? invoice.pagada_at : invoice.created_at;
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

function ymdToLongLabel(ymd: string): string {
  const normalized = ymd.includes("T") ? ymd.slice(0, 10) : ymd;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return ymd;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("es-DO", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function Billing() {
  const { tenantId, loading: authLoading, rol } = useAuth();
  // theme was declared but never read
  const [view, setView] = useState<BillingView>("facturas");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cycles, setCycles] = useState<CierreOperativoRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [invoiceModal, setInvoiceModal] = useState<Invoice | null>(null);
  // deletingInvoiceId removed
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);

const loadBillingData = useCallback(async () => {
    if (!tenantId) {
      setInvoices([]);
      setCycles([]);
      setExpenses([]);
      setExpenseCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [useLocalInvoices, useLocalCycles, useLocalExpenses, useLocalExpenseCategories] = await Promise.all([
      shouldReadLocalFirst(tenantId, ["facturas"]),
      shouldReadLocalFirst(tenantId, ["cierres_operativos"]),
      shouldReadLocalFirst(tenantId, ["gastos"]),
      shouldReadLocalFirst(tenantId, ["gasto_categorias"]),
    ]);

    const [invoicesRes, cyclesRes, expensesRes, expenseCategoriesRes] = await Promise.all([
      useLocalInvoices
        ? { data: await readLocalMirror<Invoice>(tenantId, "facturas").then(r => r.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())), error: null }
        : insforgeClient.database
            .from("facturas")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false }),
      useLocalCycles
        ? { data: await readLocalMirror<CierreOperativoRow>(tenantId, "cierres_operativos").then(r => r.sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0))), error: null }
        : insforgeClient.database
            .from("cierres_operativos")
            .select("id, business_day, cycle_number, opened_at, closed_at, printed_at, created_at")
            .eq("tenant_id", tenantId)
            .order("opened_at", { ascending: false }),
      useLocalExpenses
        ? { data: await readLocalMirror<Expense>(tenantId, "gastos").then(r => r.sort((a, b) => new Date(b.fecha_gasto || 0).getTime() - new Date(a.fecha_gasto || 0).getTime())), error: null }
        : insforgeClient.database
            .from("gastos")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("fecha_gasto", { ascending: false }),
      useLocalExpenseCategories
        ? { data: await readLocalMirror<ExpenseCategory>(tenantId, "gasto_categorias"), error: null }
        : insforgeClient.database
            .from("gasto_categorias")
            .select("id, nombre, color")
            .eq("tenant_id", tenantId),
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

    if (!expensesRes.error && expensesRes.data) {
      setExpenses(expensesRes.data as Expense[]);
    } else {
      setExpenses([]);
    }

    if (!expenseCategoriesRes.error && expenseCategoriesRes.data) {
      setExpenseCategories(expenseCategoriesRes.data as ExpenseCategory[]);
    } else {
      setExpenseCategories([]);
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
    const expenseCategoryById = new Map(expenseCategories.map((cat) => [cat.id, cat]));

    return cycles.map((cycle) => {
      const cycleStartIso = getCycleStartIso(cycle);
      const cycleEndIso = cycle.closed_at ?? new Date().toISOString();
      const cycleInvoices = invoices
        .filter((inv) => {
          const invoiceCycleAt = new Date(getInvoiceCycleIso(inv)).getTime();
          return (
            invoiceCycleAt >= new Date(cycleStartIso).getTime() &&
            invoiceCycleAt <= new Date(cycleEndIso).getTime()
          );
        })
        .sort((a, b) => new Date(getInvoiceCycleIso(a)).getTime() - new Date(getInvoiceCycleIso(b)).getTime());
      const cycleExpenses = expenses
        .filter((expense) => expense.cycle_id === cycle.id)
        .sort((a, b) => new Date(a.fecha_gasto).getTime() - new Date(b.fecha_gasto).getTime());

      const paidInvoices = cycleInvoices.filter((inv) => inv.estado === "pagada");
      const pendingInvoices = cycleInvoices.filter((inv) => inv.estado === "pendiente");
      const cancelledInvoices = cycleInvoices.filter((inv) => inv.estado === "cancelada");
      const totalSold = paidInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalExpenses = cycleExpenses.reduce((sum, expense) => sum + Number(expense.monto), 0);
      const subtotalSold = paidInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
      const taxSold = paidInvoices.reduce((sum, inv) => sum + inv.itbis, 0);
      const avgTicket = paidInvoices.length > 0 ? totalSold / paidInvoices.length : 0;

      const methodMap = new Map<string, CycleMethodSummary>();
      const categoryMap = new Map<string, { count: number; total: number }>();
      const expenseCategoryMap = new Map<string, { category: string; count: number; total: number; color?: string | null }>();
      
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

      for (const expense of cycleExpenses) {
        const cat = expense.category_id ? expenseCategoryById.get(expense.category_id) : null;
        const label = cat?.nombre || "Sin categoría";
        const current = expenseCategoryMap.get(label) ?? { category: label, count: 0, total: 0, color: cat?.color };
        current.count += 1;
        current.total += Number(expense.monto);
        expenseCategoryMap.set(label, current);
      }

      return {
        cycle,
        invoices: cycleInvoices,
        paidInvoices,
        pendingInvoices,
        cancelledInvoices,
        expenses: cycleExpenses,
        totalSold,
        totalExpenses,
        netTotal: totalSold - totalExpenses,
        subtotalSold,
        taxSold,
        avgTicket,
        firstSaleAt: cycleInvoices[0]?.created_at ?? null,
        lastSaleAt: cycleInvoices[cycleInvoices.length - 1]?.created_at ?? null,
        methodBreakdown: [...methodMap.values()].sort((a, b) => b.total - a.total),
        categoryBreakdown: [...categoryMap.entries()].map(([category, data]) => ({ category, ...data })).sort((a, b) => b.total - a.total),
        expenseCategoryBreakdown: [...expenseCategoryMap.values()].sort((a, b) => b.total - a.total),
      };
    });
  }, [cycles, invoices, expenses, expenseCategories]);

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
    const now = new Date();
    const last24h = now.getTime() - 24 * 60 * 60 * 1000;
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - now.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const latestCycle = cycleSummaries[0] ?? null;

    const paidInvoices = invoices.filter((inv) => inv.estado === "pagada");
    const salesLast24h = paidInvoices
      .filter((inv) => new Date(inv.created_at).getTime() >= last24h)
      .reduce((sum, inv) => sum + inv.total, 0);
    const expensesLast24h = expenses
      .filter((expense) => new Date(expense.fecha_gasto).getTime() >= last24h)
      .reduce((sum, expense) => sum + Number(expense.monto), 0);
    const weekSales = paidInvoices
      .filter((inv) => new Date(inv.created_at).getTime() >= weekStart.getTime())
      .reduce((sum, inv) => sum + inv.total, 0);
    const monthSales = paidInvoices
      .filter((inv) => new Date(inv.created_at).getTime() >= monthStart)
      .reduce((sum, inv) => sum + inv.total, 0);

    return {
      latestCycleSales: latestCycle?.totalSold ?? 0,
      latestCycleLabel: latestCycle
        ? `Ciclo #${latestCycle.cycle.cycle_number}`
        : "Sin ciclos",
      netLast24h: salesLast24h - expensesLast24h,
      weekSales,
      monthSales,
    };
  }, [cycleSummaries, invoices, expenses]);

  const canDeleteInvoices = rol === "admin";

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
        .select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y")
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
          logo_size_px: (tenant as any).logo_size_px,
          logo_offset_x: (tenant as any).logo_offset_x,
          logo_offset_y: (tenant as any).logo_offset_y,
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

  const printCycleReport = useCallback(
    async (entry: CycleSummary) => {
      if (!tenantId || !entry.cycle.closed_at) return;

      const { data: tenant, error: tenantError } = await insforgeClient.database
        .from("tenants")
        .select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant) {
        console.error("Error al cargar datos del negocio para imprimir cierre:", tenantError);
        return;
      }

      const paperWidthMm = getThermalPrintSettings().paperWidthMm;
      const html = buildCierreDiaReceiptHtml(
        tenant as any,
        {
          fechaOperacion: ymdToLongLabel(entry.cycle.business_day),
          cicloNumero: entry.cycle.cycle_number,
          generadoEn: formatDateTime(new Date().toISOString()),
          generadoAtIso: new Date().toISOString(),
          abiertoAtIso: getCycleStartIso(entry.cycle),
          cerradoAtIso: entry.cycle.closed_at,
          facturasPagadas: entry.paidInvoices.length,
          facturasPendientes: entry.pendingInvoices.length,
          totalPagado: entry.totalSold,
          subtotalPagado: entry.subtotalSold,
          itbisPagado: entry.taxSold,
          gastosTotal: entry.totalExpenses,
          gastosCantidad: entry.expenses.length,
          netoOperativo: entry.netTotal,
          porMetodo: entry.methodBreakdown.map((method) => ({
            etiqueta: method.label,
            cantidad: method.count,
            total: method.total,
          })),
          ticketPromedioPagado: entry.avgTicket,
        },
        paperWidthMm
      );

      const res = await printThermalHtml(html);
      if (res.ok) {
        await enqueueLocalWrite({
          tenantId,
          tableName: "cierres_operativos",
          rowId: entry.cycle.id,
          op: "update",
          payload: { printed_at: new Date().toISOString() },
          deviceId: await getDeviceId(),
        });
        await loadBillingData();
      } else if (res.error) {
        console.warn("Impresion cierre:", res.error);
      }
    },
    [tenantId, loadBillingData]
  );

  const deleteInvoiceAndTraces = useCallback(
    async (inv: Invoice) => {
      if (!tenantId) return;
      if (!canDeleteInvoices) return;
      if (inv.tenant_id != null && inv.tenant_id !== tenantId) return;

      try {
        const deviceId = await getDeviceId();

        // 1. Fetch consumos to delete locally first
        const useLocalConsumos = await shouldReadLocalFirst(tenantId, ["consumos"]);
        
        let consumosAsociados: any[] = [];
        if (useLocalConsumos) {
          const allConsumos = await readLocalMirror<any>(tenantId, "consumos");
          consumosAsociados = allConsumos.filter((c: any) => c.factura_id === inv.id);
        } else {
          const { data } = await insforgeClient.database.from("consumos").select("id").eq("tenant_id", tenantId).eq("factura_id", inv.id);
          if (data) consumosAsociados = data;
        }

        // 2. Queue deletion of each consumo
        const writes = consumosAsociados.map(c => 
          enqueueLocalWrite({
            tenantId,
            tableName: "consumos",
            rowId: c.id,
            op: "delete",
            payload: { id: c.id },
            deviceId
          })
        );

        // 3. Queue deletion of invoice
        writes.push(
          enqueueLocalWrite({
            tenantId,
            tableName: "facturas",
            rowId: inv.id,
            op: "delete",
            payload: { id: inv.id },
            deviceId
          })
        );

        await Promise.all(writes);

        setInvoiceModal((open) => (open?.id === inv.id ? null : open));
        await loadBillingData();
      } catch (err: any) {
        console.error("Error al eliminar offline:", err);
        alert(`No se pudo eliminar la factura offline: ${err.message}`);
      }
    },
    [tenantId, canDeleteInvoices, loadBillingData]
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
    <div className="flex-1 p-3 sm:p-6 lg:p-10 flex flex-col gap-4 sm:gap-6 lg:gap-10 overflow-auto max-w-[1600px] w-full mx-auto bg-background transition-colors duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="font-['Inter',sans-serif] text-[10px] sm:text-[12px] uppercase tracking-[0.22em] sm:tracking-[0.28em] text-primary">
            Analiticas operativas
          </div>
          <h1 className="font-['Space_Grotesk',sans-serif] text-foreground text-[24px] sm:text-[38px] font-bold leading-none">
            Facturas y ciclos
          </h1>
          <p className="font-['Inter',sans-serif] text-muted-foreground text-[12px] sm:text-[14px] max-w-3xl leading-relaxed">
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        {[
          {
            label: view === "facturas" ? "Ingreso Total (24h)" : "Ventas Total",
            value: (view === "facturas" ? totalRevenue : cycleKpis.latestCycleSales),
            isMoney: true,
            sub: view === "facturas" ? "Facturas recientes" : cycleKpis.latestCycleLabel,
            color: "text-green-600 dark:text-green-400"
          },
          {
            label: view === "facturas" ? "Ticket Promedio" : "Últimas 24 horas",
            value: view === "facturas" ? (invoices.length > 0 ? invoices.reduce((s, i) => s + i.total, 0) / invoices.length : 0) : cycleKpis.netLast24h,
            isMoney: true,
            sub: view === "facturas" ? `${invoices.length} totales` : "Últimas 24 horas",
            color: "text-foreground"
          },
          {
            label: view === "facturas" ? "Facturas Pagadas" : "Semana actual",
            value: view === "facturas" ? paidCount : cycleKpis.weekSales,
            isMoney: view !== "facturas",
            sub: view === "facturas" ? `${cancelledCount} canceladas` : "Semana actual",
            color: "text-pink-600 dark:text-pink-400"
          },
          {
            label: view === "facturas" ? "Total Facturas" : "Mes actual",
            value: view === "facturas" ? invoices.length : cycleKpis.monthSales,
            isMoney: view !== "facturas",
            sub: view === "facturas" ? "En el sistema" : "Mes actual",
            color: "text-primary"
          }
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-[16px] sm:rounded-[18px] border border-black/10 dark:border-white/5 p-3 sm:p-5 flex flex-col gap-2 sm:gap-3 min-h-[112px] sm:min-h-[140px] shadow-sm">
            <div className="font-['Inter',sans-serif] text-muted-foreground text-[9px] sm:text-[11px] tracking-wide uppercase font-bold leading-tight">{kpi.label}</div>
            <div className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] sm:text-[28px] tabular-nums leading-tight break-words ${kpi.color}`}>
              {kpi.isMoney ? RD(kpi.value as number) : kpi.value}
            </div>
            <div className="font-['Inter',sans-serif] text-muted-foreground text-[10px] sm:text-[12px]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-card/50 backdrop-blur-[6px] rounded-2xl border border-black/10 dark:border-white/5 p-3 sm:p-5 flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 sm:gap-5 justify-between">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-center w-full lg:w-auto">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-w-0 bg-muted rounded-xl border border-black/10 dark:border-white/10 px-3 sm:px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[13px] sm:text-[14px] outline-none focus:border-primary transition-colors"
            />
            <span className="text-muted-foreground">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-w-0 bg-muted rounded-xl border border-black/10 dark:border-white/10 px-3 sm:px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[13px] sm:text-[14px] outline-none focus:border-primary transition-colors"
            />
          </div>

          {view === "facturas" && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[13px] sm:text-[14px] outline-none cursor-pointer"
              >
                <option value="todos">Todos los Estados</option>
                <option value="pagada">Pagadas</option>
                <option value="cancelada">Canceladas</option>
              </select>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="w-full sm:w-auto bg-muted rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 font-['Inter',sans-serif] text-foreground text-[13px] sm:text-[14px] outline-none cursor-pointer"
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
        <button onClick={() => void loadBillingData()} className="w-full lg:w-auto bg-primary text-primary-foreground rounded-xl px-6 py-2.5 font-bold uppercase text-[12px] tracking-widest hover:opacity-90 transition-all">Actualizar</button>
      </div>

      {view === "facturas" ? (
        <>
        <div className="md:hidden flex flex-col gap-3">
          {pageData.length === 0 ? (
            <div className="rounded-[20px] border border-black/10 bg-card p-8 text-center text-sm text-muted-foreground dark:border-white/5">
              No se encontraron facturas.
            </div>
          ) : (
            pageData.map((inv) => {
              const status = statusConfig[inv.estado];
              const method = getMethodDisplay(inv.metodo_pago);
              const date = new Date(inv.created_at);
              return (
                <div key={inv.id} className="rounded-[20px] border border-black/10 bg-card p-4 shadow-sm dark:border-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-['Space_Grotesk',sans-serif] text-lg font-bold text-foreground">
                        #{String(inv.numero_factura).padStart(4, "0")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    </div>
                    <div className="text-right font-['Space_Grotesk',sans-serif] text-lg font-bold text-primary tabular-nums">
                      {RD(inv.total)}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Origen</div>
                      <div className="mt-1 font-semibold text-foreground">{inv.mesa_numero ? `Mesa ${inv.mesa_numero}` : "Para llevar"}</div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Método</div>
                      <div className="mt-1 font-semibold text-foreground">{method.label}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 rounded-full border border-black/5 bg-muted/50 px-3 py-1 dark:border-white/5">
                      <div className="size-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                      <span className="text-[10px] font-bold uppercase" style={{ color: status.color }}>{status.label}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setInvoiceModal(inv)} className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border-none"><Eye size={16} /></button>
                      <button onClick={() => void printInvoice(inv)} className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border-none"><Printer size={16} /></button>
                      {canDeleteInvoices && <button onClick={() => void deleteInvoiceAndTraces(inv)} className="size-9 rounded-lg bg-muted flex items-center justify-center text-destructive/70 border-none"><Trash2 size={16} /></button>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-[24px] border border-black/10 dark:border-white/5 bg-card">
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
                        {canDeleteInvoices && <button onClick={() => void deleteInvoiceAndTraces(inv)} className="size-8 rounded-lg bg-muted flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all border-none cursor-pointer"><Trash2 size={16} /></button>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        </>
      ) : (
        <div className="flex flex-col gap-6">
          {filteredCycleSummaries.map((entry) => (
             <div key={entry.cycle.id} className="bg-card rounded-[24px] border border-black/10 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-8 flex flex-col gap-4 sm:gap-6">
                   <div className="flex flex-col lg:flex-row justify-between gap-6">
                      <div className="space-y-2">
                         <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ciclo #{entry.cycle.cycle_number}</span>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${entry.cycle.closed_at ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>
                               {entry.cycle.closed_at ? "Cerrado" : "Abierto"}
                            </span>
                         </div>
                         <h2 className="font-['Space_Grotesk',sans-serif] text-[21px] sm:text-[28px] font-bold text-foreground">Día {entry.cycle.business_day}</h2>
                         <p className="text-muted-foreground text-[12px] sm:text-[14px]">Operación: {formatDateTime(entry.cycle.opened_at)} - {formatDateTime(entry.cycle.closed_at)}</p>
                      </div>
                      <div className="flex flex-col gap-3 lg:items-end">
                      <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-4">
                         {[
                           { label: "Vendido", val: RD(entry.totalSold), color: "text-foreground" },
                           { label: "Gastos", val: RD(entry.totalExpenses), color: "text-primary" },
                           { label: "Neto", val: RD(entry.netTotal), color: entry.netTotal >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive" }
                         ].map((st, j) => (
                           <div key={j} className="bg-muted/50 rounded-2xl px-3 sm:px-6 py-3 sm:py-4 border border-black/5 dark:border-white/5 min-w-0">
                              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{st.label}</div>
                              <div className={`font-['Space_Grotesk',sans-serif] text-[13px] sm:text-[20px] font-bold tabular-nums break-words ${st.color}`}>{st.val}</div>
                           </div>
                         ))}
                      </div>
                      {entry.cycle.closed_at && (
                        <button
                          type="button"
                          onClick={() => void printCycleReport(entry)}
                          className="inline-flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-black/5 dark:hover:bg-white/10 border border-border"
                        >
                          <Printer size={15} />
                          Reimprimir cierre
                        </button>
                      )}
                      </div>
                   </div>

                   <button onClick={() => setExpandedCycleId(expandedCycleId === entry.cycle.id ? null : entry.cycle.id)} className="flex items-center gap-2 text-primary font-bold text-[13px] uppercase tracking-wider hover:opacity-80 transition-all border-none bg-transparent cursor-pointer">
                      {expandedCycleId === entry.cycle.id ? "Ocultar detalle" : "Ver detalle de ciclo"}
                      <ChevronDown size={16} className={`transition-transform ${expandedCycleId === entry.cycle.id ? "rotate-180" : ""}`} />
                   </button>
                   
                   {expandedCycleId === entry.cycle.id && (
                     <div className="pt-4 sm:pt-6 mt-2 border-t border-black/10 dark:border-white/5 animate-in fade-in slide-in-from-top-2 grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-8">
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
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Gastos del Ciclo</div>
                          <div className="space-y-3">
                            <div className="rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-foreground font-medium text-[14px]">Total gastos</span>
                                <span className="font-bold text-[14px]">{RD(entry.totalExpenses)}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-muted-foreground">{entry.expenses.length} registros</div>
                            </div>

                            {entry.expenseCategoryBreakdown.length > 0 ? entry.expenseCategoryBreakdown.map((cat, idx) => (
                              <div key={idx} className="flex justify-between items-center p-3 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                                <div className="flex items-center gap-2">
                                  <span className="size-2.5 rounded-full" style={{ backgroundColor: cat.color || "#ff906d" }} />
                                  <div className="flex flex-col">
                                    <span className="text-foreground font-medium text-[14px]">{cat.category}</span>
                                    <span className="text-muted-foreground text-[11px]">{cat.count} gastos</span>
                                  </div>
                                </div>
                                <span className="font-bold text-[14px]">{RD(cat.total)}</span>
                              </div>
                            )) : (
                              <div className="text-muted-foreground text-[13px] italic">No hay gastos en este ciclo.</div>
                            )}

                            {entry.expenses.length > 0 && (
                              <div className="max-h-[240px] overflow-y-auto pr-1 space-y-2">
                                {entry.expenses.map((expense) => (
                                  <div key={expense.id} className="rounded-xl border border-black/5 dark:border-white/5 bg-card/60 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-foreground truncate">{expense.descripcion}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                          {formatDateTime(expense.fecha_gasto)}
                                          {expense.proveedor ? ` · ${expense.proveedor}` : ""}
                                        </div>
                                      </div>
                                      <div className="shrink-0 text-[13px] font-bold text-primary">{RD(expense.monto)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
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
    </div>
  );
}
