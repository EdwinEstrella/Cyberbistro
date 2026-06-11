import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Eye, Printer, Trash2, TrendingUp, DollarSign, RefreshCw, FileText, Activity, Calendar } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth, ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import { buildCierreDiaReceiptHtml, buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { readLocalMirror, enqueueLocalWrite, getDeviceId, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { cacheLogoFromUrl } from "../../../shared/lib/logoCache";
import { useSucursal } from "../../../app/context/SucursalContext";
import { canUseFeature } from "../../../shared/lib/planFeatures";
// useTheme removed
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";

type InvoiceStatus = "pagada" | "pendiente" | "cancelada";
type BillingView = "facturas" | "ciclos" | "finanzas";

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
  monto_recibido?: number | null;
  cambio_devuelto?: number | null;
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
    let platesData: Array<{ id: number; categoria?: string | null }> = [];
    const useLocal = await shouldReadLocalFirst(tenantId, ["platos"]);
    if (useLocal) {
      try {
        const allLocal = await readLocalMirror<{ id: number; categoria?: string | null }>(tenantId, "platos");
        platesData = allLocal.filter(p => plateIds.includes(p.id));
      } catch {
        platesData = [];
      }
    } else {
      const { data } = await insforgeClient.database
        .from("platos")
        .select("id, categoria")
        .eq("tenant_id", tenantId)
        .in("id", plateIds);
      platesData = (data as Array<{ id: number; categoria?: string | null }>) ?? [];
    }

    for (const plate of platesData) {
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

function getEcfStatusDisplay(status: string) {
  switch (status) {
    case "accepted":
      return { label: "e-CF: Aceptado", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" };
    case "rejected":
      return { label: "e-CF: Rechazado", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" };
    case "submitted":
      return { label: "e-CF: Enviado", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" };
    case "signed":
      return { label: "e-CF: Firmado", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" };
    case "queued":
      return { label: "e-CF: En Cola", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" };
    case "pending_sync":
      return { label: "e-CF: Pendiente", color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
    case "retryable_error":
      return { label: "e-CF: Error (Reintento)", color: "#f97316", bg: "rgba(249, 115, 22, 0.1)" };
    case "terminal_error":
      return { label: "e-CF: Error Terminal", color: "#7f1d1d", bg: "rgba(127, 29, 29, 0.1)" };
    default:
      return { label: `e-CF: ${status}`, color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
  }
}

export function Billing() {
  const { tenantId, loading: authLoading, rol, plan } = useAuth();
  const { activeSucursalId } = useSucursal();
  // theme was declared but never read
  const [view, setView] = useState<BillingView>("facturas");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ecfDocuments, setEcfDocuments] = useState<Map<string, any>>(new Map());
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

  // Cuentas por Cobrar & Pagar Pro States
  const [cuentasCobrar, setCuentasCobrar] = useState<any[]>([]);
  const [cxcPagos, setCxcPagos] = useState<any[]>([]);
  const [cuentasPagar, setCuentasPagar] = useState<any[]>([]);
  const [cxpPagos, setCxpPagos] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);

  const loadBillingData = useCallback(async () => {
    if (!tenantId) {
      setInvoices([]);
      setCycles([]);
      setExpenses([]);
      setExpenseCategories([]);
      setCuentasCobrar([]);
      setCxcPagos([]);
      setCuentasPagar([]);
      setCxpPagos([]);
      setCustomers([]);
      setProveedores([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    await ensureAuthSessionFresh();

    const [
      useLocalInvoices,
      useLocalCycles,
      useLocalExpenses,
      useLocalExpenseCategories,
      useLocalCxc,
      useLocalCxp,
      useLocalCustomers,
      useLocalProveedores,
      useLocalEcf
    ] = await Promise.all([
      shouldReadLocalFirst(tenantId, ["facturas"]),
      shouldReadLocalFirst(tenantId, ["cierres_operativos"]),
      shouldReadLocalFirst(tenantId, ["gastos"]),
      shouldReadLocalFirst(tenantId, ["gasto_categorias"]),
      shouldReadLocalFirst(tenantId, ["cuentas_cobrar", "cxc_pagos"]),
      shouldReadLocalFirst(tenantId, ["cuentas_pagar", "cxp_pagos"]),
      shouldReadLocalFirst(tenantId, ["customers"]),
      shouldReadLocalFirst(tenantId, ["proveedores"]),
      shouldReadLocalFirst(tenantId, ["ecf_documents"]),
    ]);

    const [
      invoicesRes,
      cyclesRes,
      expensesRes,
      expenseCategoriesRes,
      cxcRes,
      cxcPagosRes,
      cxpRes,
      cxpPagosRes,
      customersRes,
      proveedoresRes,
      ecfRes
    ] = await Promise.all([
      useLocalInvoices
        ? { data: await readLocalMirror<Invoice & { sucursal_id?: string | null }>(tenantId, "facturas").then(r => r.filter(f => !f.sucursal_id || f.sucursal_id === activeSucursalId).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("facturas").select("*").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`).order("created_at", { ascending: false })
          : insforgeClient.database.from("facturas").select("*").eq("tenant_id", tenantId).is("sucursal_id", null).order("created_at", { ascending: false }),
      useLocalCycles
        ? { data: await readLocalMirror<CierreOperativoRow & { sucursal_id?: string | null }>(tenantId, "cierres_operativos").then(r => r.filter(c => !c.sucursal_id || c.sucursal_id === activeSucursalId).sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0))), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("cierres_operativos").select("id, business_day, cycle_number, opened_at, closed_at, printed_at, created_at").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`).order("opened_at", { ascending: false })
          : insforgeClient.database.from("cierres_operativos").select("id, business_day, cycle_number, opened_at, closed_at, printed_at, created_at").eq("tenant_id", tenantId).is("sucursal_id", null).order("opened_at", { ascending: false }),
      useLocalExpenses
        ? { data: await readLocalMirror<Expense & { sucursal_id?: string | null }>(tenantId, "gastos").then(r => r.filter(g => !g.sucursal_id || g.sucursal_id === activeSucursalId).sort((a, b) => new Date(b.fecha_gasto || 0).getTime() - new Date(a.fecha_gasto || 0).getTime())), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("gastos").select("*").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`).order("fecha_gasto", { ascending: false })
          : insforgeClient.database.from("gastos").select("*").eq("tenant_id", tenantId).is("sucursal_id", null).order("fecha_gasto", { ascending: false }),
      useLocalExpenseCategories
        ? { data: await readLocalMirror<ExpenseCategory & { sucursal_id?: string | null }>(tenantId, "gasto_categorias").then(r => r.filter(c => !c.sucursal_id || c.sucursal_id === activeSucursalId)), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("gasto_categorias").select("id, nombre, color").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`)
          : insforgeClient.database.from("gasto_categorias").select("id, nombre, color").eq("tenant_id", tenantId).is("sucursal_id", null),
      useLocalCxc
        ? { data: await readLocalMirror<any>(tenantId, "cuentas_cobrar").then(r => r.filter(c => !c.sucursal_id || c.sucursal_id === activeSucursalId)), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("cuentas_cobrar").select("*").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`)
          : insforgeClient.database.from("cuentas_cobrar").select("*").eq("tenant_id", tenantId).is("sucursal_id", null),
      useLocalCxc
        ? { data: await readLocalMirror<any>(tenantId, "cxc_pagos").then(r => r.filter(p => !p.sucursal_id || p.sucursal_id === activeSucursalId)), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("cxc_pagos").select("*").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`)
          : insforgeClient.database.from("cxc_pagos").select("*").eq("tenant_id", tenantId).is("sucursal_id", null),
      useLocalCxp
        ? { data: await readLocalMirror<any>(tenantId, "cuentas_pagar").then(r => r.filter(c => !c.sucursal_id || c.sucursal_id === activeSucursalId)), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("cuentas_pagar").select("*").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`)
          : insforgeClient.database.from("cuentas_pagar").select("*").eq("tenant_id", tenantId).is("sucursal_id", null),
      useLocalCxp
        ? { data: await readLocalMirror<any>(tenantId, "cxp_pagos").then(r => r.filter(p => !p.sucursal_id || p.sucursal_id === activeSucursalId)), error: null }
        : activeSucursalId
          ? insforgeClient.database.from("cxp_pagos").select("*").eq("tenant_id", tenantId).or(`sucursal_id.eq.${activeSucursalId},sucursal_id.is.null`)
          : insforgeClient.database.from("cxp_pagos").select("*").eq("tenant_id", tenantId).is("sucursal_id", null),
      useLocalCustomers
        ? { data: await readLocalMirror<any>(tenantId, "customers"), error: null }
        : insforgeClient.database.from("customers").select("id, name").eq("tenant_id", tenantId),
      useLocalProveedores
        ? { data: await readLocalMirror<any>(tenantId, "proveedores"), error: null }
        : insforgeClient.database.from("proveedores").select("id, nombre").eq("tenant_id", tenantId),
      useLocalEcf
        ? { data: await readLocalMirror<any>(tenantId, "ecf_documents"), error: null }
        : insforgeClient.database.from("ecf_documents").select("*").eq("tenant_id", tenantId),
    ]);

    if (!invoicesRes.error && invoicesRes.data) {
      const hydratedInvoices = await hydrateInvoiceItemCategories(tenantId, invoicesRes.data as Invoice[]);
      setInvoices(hydratedInvoices);
    } else {
      setInvoices([]);
    }

    if (!ecfRes.error && ecfRes.data) {
      const ecfMap = new Map<string, any>();
      for (const doc of ecfRes.data as any[]) {
        ecfMap.set(doc.factura_id, doc);
      }
      setEcfDocuments(ecfMap);
    } else {
      setEcfDocuments(new Map());
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

    setCuentasCobrar(cxcRes.data || []);
    setCxcPagos(cxcPagosRes.data || []);
    setCuentasPagar(cxpRes.data || []);
    setCxpPagos(cxpPagosRes.data || []);
    setCustomers(customersRes.data || []);
    setProveedores(proveedoresRes.data || []);

    setCurrentPage(1);
    setLoading(false);
  }, [tenantId, activeSucursalId]);

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

  const finanzasData = useMemo(() => {
    const cxcActivas = cuentasCobrar.filter((c) => c.estado !== "pagada");
    const totalDeudaClientes = cxcActivas.reduce((sum, c) => sum + (Number(c.monto_total) - Number(c.monto_pagado)), 0);

    const cxpActivas = cuentasPagar.filter((c) => c.estado !== "pagada");
    const totalDeudaProveedores = cxpActivas.reduce((sum, c) => sum + (Number(c.monto_total) - Number(c.monto_pagado)), 0);

    let cobrosFiltrados = cxcPagos;
    if (dateFrom) {
      cobrosFiltrados = cobrosFiltrados.filter((p) => new Date(p.fecha_pago).getTime() >= new Date(dateFrom + "T00:00:00").getTime());
    }
    if (dateTo) {
      cobrosFiltrados = cobrosFiltrados.filter((p) => new Date(p.fecha_pago).getTime() <= new Date(dateTo + "T23:59:59").getTime());
    }
    const totalCobros = cobrosFiltrados.reduce((sum, p) => sum + Number(p.monto), 0);

    let abonosFiltrados = cxpPagos;
    if (dateFrom) {
      abonosFiltrados = abonosFiltrados.filter((p) => new Date(p.fecha_pago).getTime() >= new Date(dateFrom + "T00:00:00").getTime());
    }
    if (dateTo) {
      abonosFiltrados = abonosFiltrados.filter((p) => new Date(p.fecha_pago).getTime() <= new Date(dateTo + "T23:59:59").getTime());
    }
    const totalAbonos = abonosFiltrados.reduce((sum, p) => sum + Number(p.monto), 0);

    const customerMap = new Map<string, { id: string; name: string; deuda: number }>();
    cxcActivas.forEach((c) => {
      const cust = customers.find((cust) => cust.id === c.customer_id);
      const name = cust ? cust.name : `Cliente #${c.customer_id.substring(0, 5)}`;
      const saldo = Number(c.monto_total) - Number(c.monto_pagado);
      if (saldo > 0) {
        const exist = customerMap.get(c.customer_id) ?? { id: c.customer_id, name, deuda: 0 };
        exist.deuda += saldo;
        customerMap.set(c.customer_id, exist);
      }
    });
    const topDebtors = [...customerMap.values()]
      .sort((a, b) => b.deuda - a.deuda)
      .slice(0, 5);

    const providerMap = new Map<string, { id: string; name: string; deuda: number }>();
    cxpActivas.forEach((c) => {
      const prov = proveedores.find((p) => p.id === c.proveedor_id);
      const name = prov ? prov.nombre : `Proveedor #${c.proveedor_id.substring(0, 5)}`;
      const saldo = Number(c.monto_total) - Number(c.monto_pagado);
      if (saldo > 0) {
        const exist = providerMap.get(c.proveedor_id) ?? { id: c.proveedor_id, name, deuda: 0 };
        exist.deuda += saldo;
        providerMap.set(c.proveedor_id, exist);
      }
    });
    const topCreditors = [...providerMap.values()]
      .sort((a, b) => b.deuda - a.deuda)
      .slice(0, 5);

    const txCobros = cobrosFiltrados.map((p) => {
      const cc = cuentasCobrar.find((c) => c.id === p.cuenta_cobrar_id);
      const cust = cc ? customers.find((cust) => cust.id === cc.customer_id) : null;
      const desc = cust ? `Cobro CxC - ${cust.name}` : "Cobro CxC";
      return {
        id: p.id,
        tipo: "ingreso" as const,
        monto: Number(p.monto),
        fecha: p.fecha_pago,
        metodo: p.metodo_pago,
        descripcion: desc,
        referencia: cc?.factura_id ? `Factura #${cc.factura_id.substring(0, 5)}` : "S/F"
      };
    });

    const txAbonos = abonosFiltrados.map((p) => {
      const cp = cuentasPagar.find((c) => c.id === p.cuenta_pagar_id);
      const prov = cp ? proveedores.find((pr) => pr.id === cp.proveedor_id) : null;
      const desc = prov ? `Abono CxP - ${prov.nombre}` : "Abono CxP";
      return {
        id: p.id,
        tipo: "egreso" as const,
        monto: Number(p.monto),
        fecha: p.fecha_pago,
        metodo: p.metodo_pago,
        descripcion: desc,
        referencia: cp?.compra_id ? `Compra #${cp.compra_id.substring(0, 5)}` : "S/C"
      };
    });

    const transacciones = [...txCobros, ...txAbonos]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return {
      totalDeudaClientes,
      totalDeudaProveedores,
      totalCobros,
      totalAbonos,
      topDebtors,
      topCreditors,
      transacciones
    };
  }, [cuentasCobrar, cxcPagos, cuentasPagar, cxpPagos, customers, proveedores, dateFrom, dateTo]);

  const filteredTransacciones = useMemo(() => {
    let txs = finanzasData.transacciones;
    if (methodFilter !== "todos") {
      txs = txs.filter((t) => t.metodo === methodFilter);
    }
    return txs;
  }, [finanzasData.transacciones, methodFilter]);


  const cycleSummaries = useMemo<CycleSummary[]>(() => {
    const expenseCategoryById = new Map(expenseCategories.map((cat) => [cat.id, cat]));

    return cycles.map((cycle) => {
      const cycleStartIso = getCycleStartIso(cycle);
      const cycleEndIso = cycle.closed_at;
      const cycleInvoices = invoices
        .filter((inv) => {
          const invoiceCycleAt = new Date(getInvoiceCycleIso(inv)).getTime();
          if (invoiceCycleAt < new Date(cycleStartIso).getTime()) return false;
          if (cycleEndIso && invoiceCycleAt > new Date(cycleEndIso).getTime()) return false;
          return true;
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
  const totalPages = useMemo(() => {
    if (view === "facturas") {
      return Math.ceil(filteredInvoices.length / itemsPerPage);
    } else if (view === "finanzas") {
      return Math.ceil(filteredTransacciones.length / itemsPerPage);
    }
    return 1;
  }, [view, filteredInvoices.length, filteredTransacciones.length]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = useMemo(
    () => (view === "facturas" ? filteredInvoices.slice(startIndex, endIndex) : []),
    [view, filteredInvoices, startIndex, endIndex]
  );

  const transaccionesPageData = useMemo(
    () => (view === "finanzas" ? filteredTransacciones.slice(startIndex, endIndex) : []),
    [view, filteredTransacciones, startIndex, endIndex]
  );

  const kpiCards = useMemo(() => {
    if (view === "finanzas") {
      return [
        {
          label: "Deuda Clientes",
          value: finanzasData.totalDeudaClientes,
          isMoney: true,
          sub: "Cartera total activa",
          color: "text-amber-600 dark:text-amber-400",
          icon: <Activity size={18} className="text-amber-600 dark:text-amber-400" />,
          bgColor: "bg-amber-500/10 dark:bg-amber-500/20"
        },
        {
          label: "Deuda Proveedores",
          value: finanzasData.totalDeudaProveedores,
          isMoney: true,
          sub: "Cuentas por pagar",
          color: "text-rose-600 dark:text-rose-400",
          icon: <TrendingUp size={18} className="text-rose-600 dark:text-rose-400" />,
          bgColor: "bg-rose-500/10 dark:bg-rose-500/20"
        },
        {
          label: "Cobros",
          value: finanzasData.totalCobros,
          isMoney: true,
          sub: "Cobros en período",
          color: "text-green-600 dark:text-green-400",
          icon: <DollarSign size={18} className="text-green-600 dark:text-green-400" />,
          bgColor: "bg-green-500/10 dark:bg-green-500/20"
        },
        {
          label: "Abonos",
          value: finanzasData.totalAbonos,
          isMoney: true,
          sub: "Abonos en período",
          color: "text-blue-600 dark:text-blue-400",
          icon: <FileText size={18} className="text-blue-500" />,
          bgColor: "bg-blue-500/10 dark:bg-blue-500/20"
        }
      ];
    }
    return [
      {
        label: view === "facturas" ? "Ingreso Total (24h)" : "Ventas Total",
        value: (view === "facturas" ? totalRevenue : cycleKpis.latestCycleSales),
        isMoney: true,
        sub: view === "facturas" ? "Facturas recientes" : cycleKpis.latestCycleLabel,
        color: "text-green-600 dark:text-green-400",
        icon: <DollarSign size={18} className="text-green-600 dark:text-green-400" />,
        bgColor: "bg-green-500/10 dark:bg-green-500/20"
      },
      {
        label: view === "facturas" ? "Ticket Promedio" : "Últimas 24 horas",
        value: view === "facturas" ? (invoices.length > 0 ? invoices.reduce((s, i) => s + i.total, 0) / invoices.length : 0) : cycleKpis.netLast24h,
        isMoney: true,
        sub: view === "facturas" ? `${invoices.length} totales` : "Últimas 24 horas",
        color: "text-foreground",
        icon: <Activity size={18} className="text-primary" />,
        bgColor: "bg-primary/10 dark:bg-primary/20"
      },
      {
        label: view === "facturas" ? "Facturas Pagadas" : "Semana actual",
        value: view === "facturas" ? paidCount : cycleKpis.weekSales,
        isMoney: view !== "facturas",
        sub: view === "facturas" ? `${cancelledCount} canceladas` : "Semana actual",
        color: "text-foreground",
        icon: <TrendingUp size={18} className="text-pink-600 dark:text-pink-400" />,
        bgColor: "bg-pink-500/10 dark:bg-pink-500/20"
      },
      {
        label: view === "facturas" ? "Total Facturas" : "Mes actual",
        value: view === "facturas" ? invoices.length : cycleKpis.monthSales,
        isMoney: view !== "facturas",
        sub: view === "facturas" ? "En el sistema" : "Mes actual",
        color: "text-foreground",
        icon: <FileText size={18} className="text-blue-500" />,
        bgColor: "bg-blue-500/10 dark:bg-blue-500/20"
      }
    ];
  }, [view, finanzasData, totalRevenue, cycleKpis, invoices, paidCount, cancelledCount]);

  const filteredStats = useMemo(() => {
    const total = filteredInvoices
      .filter((inv) => inv.estado === "pagada")
      .reduce((sum, inv) => sum + inv.total, 0);
    const count = filteredInvoices.length;
    const avg = count > 0 ? total / count : 0;
    
    const methodCounts: Record<string, number> = {};
    for (const inv of filteredInvoices) {
      if (inv.estado === "pagada") {
        methodCounts[inv.metodo_pago] = (methodCounts[inv.metodo_pago] || 0) + inv.total;
      }
    }
    
    let mainMethod = "Ninguno";
    let maxTotal = 0;
    for (const [m, totalVal] of Object.entries(methodCounts)) {
      if (totalVal > maxTotal) {
        maxTotal = totalVal;
        mainMethod = m;
      }
    }
    
    const mainMethodLabel = mainMethod !== "Ninguno" ? getMethodDisplay(mainMethod).label : "Ninguno";
    
    return { total, count, avg, mainMethodLabel };
  }, [filteredInvoices]);

  const printInvoice = useCallback(
    async (inv: Invoice) => {
      if (!tenantId) return;
      if (inv.tenant_id != null && inv.tenant_id !== tenantId) return;

      const tid = inv.tenant_id ?? tenantId;

      let tenant: any = null;
      let tenantError: any = null;
      try {
        if (!navigator.onLine) {
          const localTenants = await readLocalMirror<any>(tid, "tenants");
          tenant = localTenants.find(t => t.id === tid) ?? null;
        } else {
          const { data, error } = await insforgeClient.database
            .from("tenants")
            .select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y")
            .eq("id", tid)
            .single();
          if (error) throw error;
          tenant = data;
          tenantError = error;
        }
      } catch (err) {
        const localTenants = await readLocalMirror<any>(tid, "tenants").catch(() => []);
        tenant = localTenants.find((t) => t.id === tid) ?? null;
      }

      if (!tenant) {
        console.error("Error al cargar datos del negocio para imprimir:", tenantError);
        return;
      }

      void cacheLogoFromUrl(tenant.logo_url);

      const items = Array.isArray(inv.items) ? inv.items : [];
      const paperWidthMm = getThermalPrintSettings().paperWidthMm;
      const html = await buildFacturaReceiptHtml(
        {
          nombre_negocio: tenant.nombre_negocio,
          rnc: tenant.rnc,
          direccion: tenant.direccion,
          telefono: tenant.telefono,
          logo_url: tenant.logo_url,
          logo_size_px: (tenant as any).logo_size_px,
          logo_offset_x: (tenant as any).logo_offset_x,
          logo_offset_y: (tenant as any).logo_offset_y,
          menu_url: (tenant as any).menu_url,
          moneda: (tenant as any).currency_code,
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
          monto_recibido: inv.monto_recibido ?? null,
          cambio_devuelto: inv.cambio_devuelto ?? null,
          ncf: inv.ncf ?? null,
          ncf_tipo: inv.ncf_tipo ?? null,
          cliente_nombre: inv.cliente_nombre ?? null,
          cliente_rnc: inv.cliente_rnc ?? null,
          ecf_status: ecfDocuments.get(inv.id)?.status ?? null,
          ecf_track_id: ecfDocuments.get(inv.id)?.dgii_track_id ?? null,
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

      let tenant: any = null;
      let tenantError: any = null;
      try {
        if (!navigator.onLine) {
          const localTenants = await readLocalMirror<any>(tenantId, "tenants");
          tenant = localTenants.find(t => t.id === tenantId) ?? null;
        } else {
          const { data, error } = await insforgeClient.database
            .from("tenants")
            .select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y")
            .eq("id", tenantId)
            .single();
          if (error) throw error;
          tenant = data;
        }
      } catch (err) {
        const localTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
        tenant = localTenants.find((t) => t.id === tenantId) ?? null;
      }

      if (!tenant) {
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
    <div className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 w-full max-w-[1600px] mx-auto bg-background transition-colors duration-300">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-black/5 dark:border-white/5 pb-5">
        <h1 className="font-['Space_Grotesk',sans-serif] text-foreground text-[26px] sm:text-[34px] font-bold leading-none tracking-tight">
          Facturas y ciclos
        </h1>
        <div className="bg-muted p-1 rounded-xl border border-black/5 dark:border-white/5 flex items-center gap-1 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setView("facturas")}
            className={`flex-1 sm:flex-none rounded-lg px-5 py-2.5 font-['Inter',sans-serif] text-[13px] font-bold transition-all cursor-pointer ${
              view === "facturas" ? "bg-green-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Facturas
          </button>
          <button
            type="button"
            onClick={() => setView("ciclos")}
            className={`flex-1 sm:flex-none rounded-lg px-5 py-2.5 font-['Inter',sans-serif] text-[13px] font-bold transition-all cursor-pointer ${
              view === "ciclos" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ciclos
          </button>
          {canUseFeature(plan, "finance_reports") && (
            <button
              type="button"
              onClick={() => setView("finanzas")}
              className={`flex-1 sm:flex-none rounded-lg px-5 py-2.5 font-['Inter',sans-serif] text-[13px] font-bold transition-all cursor-pointer ${
                view === "finanzas" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Finanzas Pro
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-5 flex justify-between items-start shadow-sm transition-all hover:shadow-md hover:border-black/15 dark:hover:border-white/10">
            <div className="flex flex-col gap-2 flex-1 min-w-0 pr-2">
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[10px] sm:text-[11px] tracking-wider uppercase font-semibold leading-tight">{kpi.label}</span>
              <div className={`font-['Space_Grotesk',sans-serif] font-bold text-[20px] sm:text-[26px] tabular-nums leading-none break-words ${kpi.color}`}>
                {kpi.isMoney ? RD(kpi.value as number) : kpi.value}
              </div>
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[10px] sm:text-[11px] font-medium">{kpi.sub}</span>
            </div>
            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${kpi.bgColor}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Filters Bar + List/Table */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
          {/* Horizontal Filter Bar Card */}
          <div className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className={`flex-1 grid grid-cols-1 sm:grid-cols-2 ${view === "facturas" ? "lg:grid-cols-4" : view === "finanzas" ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-4`}>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-['Inter']">Desde</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-muted/60 rounded-xl border border-black/5 dark:border-white/5 px-3 py-2 font-['Inter',sans-serif] text-foreground text-[13px] outline-none focus:border-primary transition-colors cursor-pointer h-[38px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-['Inter']">Hasta</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-muted/60 rounded-xl border border-black/5 dark:border-white/5 px-3 py-2 font-['Inter',sans-serif] text-foreground text-[13px] outline-none focus:border-primary transition-colors cursor-pointer h-[38px]"
                  />
                </div>

                {(view === "facturas" || view === "finanzas") && (
                  <>
                    {view === "facturas" && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-['Inter']">Estado</span>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="w-full bg-muted/60 rounded-xl border border-black/5 dark:border-white/5 px-3 py-2 font-['Inter',sans-serif] text-foreground text-[13px] outline-none cursor-pointer h-[38px]"
                        >
                          <option value="todos">Todos los Estados</option>
                          <option value="pagada">Pagadas</option>
                          <option value="cancelada">Canceladas</option>
                        </select>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-['Inter']">Método</span>
                      <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value)}
                        className="w-full bg-muted/60 rounded-xl border border-black/5 dark:border-white/5 px-3 py-2 font-['Inter',sans-serif] text-foreground text-[13px] outline-none cursor-pointer h-[38px]"
                      >
                        <option value="todos">Todos los Métodos</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="digital">Digital</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => void loadBillingData()}
                className="bg-primary text-primary-foreground rounded-xl px-6 py-2.5 font-bold uppercase text-[11px] tracking-widest hover:opacity-90 transition-all border-none cursor-pointer shadow-sm flex items-center justify-center gap-2 h-[38px] w-full lg:w-auto shrink-0"
              >
                <RefreshCw size={12} className="shrink-0" />
                Filtrar
              </button>
            </div>
          </div>

          {view === "facturas" && (
            <>
              {/* Mobile View */}
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
                            <div className="text-xs text-muted-foreground font-medium">
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
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 rounded-full border border-black/5 bg-muted/50 px-3 py-1 dark:border-white/5 w-fit">
                              <div className="size-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                              <span className="text-[10px] font-bold uppercase" style={{ color: status.color }}>{status.label}</span>
                            </div>
                            {(() => {
                              const ecfDoc = ecfDocuments.get(inv.id);
                              if (!ecfDoc) return null;
                              const ecfDisplay = getEcfStatusDisplay(ecfDoc.status);
                              return (
                                <div className="flex items-center gap-2 rounded-full border border-black/5 px-3 py-1 dark:border-white/5 w-fit" style={{ borderColor: ecfDisplay.color + "22", backgroundColor: ecfDisplay.bg }}>
                                  <div className="size-1.5 rounded-full" style={{ backgroundColor: ecfDisplay.color }} />
                                  <span className="text-[10px] font-bold uppercase" style={{ color: ecfDisplay.color }}>{ecfDisplay.label}</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setInvoiceModal(inv)} className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border-none cursor-pointer"><Eye size={16} /></button>
                            <button onClick={() => void printInvoice(inv)} className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border-none cursor-pointer"><Printer size={16} /></button>
                            {canDeleteInvoices && <button onClick={() => void deleteInvoiceAndTraces(inv)} className="size-9 rounded-lg bg-muted flex items-center justify-center text-destructive/70 border-none cursor-pointer"><Trash2 size={16} /></button>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop View */}
              <div className="hidden md:block overflow-x-auto rounded-[20px] border border-black/10 dark:border-white/5 bg-card shadow-sm">
                <div className="min-w-[1000px]">
                  <div className={`${gridColsClass} bg-muted/50 border-b border-black/10 dark:border-white/10 px-6 py-4`}>
                    {["ID", "Fecha", "Mesa / Origen", "Método", "Estado", "Monto", "Acciones"].map((h, i) => (
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
                               {(() => {
                                 const ecfDoc = ecfDocuments.get(inv.id);
                                 if (!ecfDoc) return null;
                                 const ecfDisplay = getEcfStatusDisplay(ecfDoc.status);
                                 return (
                                   <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-black/5 dark:border-white/5 w-fit mt-1.5" style={{ borderColor: ecfDisplay.color + "22", backgroundColor: ecfDisplay.bg }}>
                                     <div className="size-1.5 rounded-full" style={{ backgroundColor: ecfDisplay.color }} />
                                     <span className="text-[10px] font-bold uppercase" style={{ color: ecfDisplay.color }}>{ecfDisplay.label}</span>
                                   </div>
                                 );
                               })()}
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 mt-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest bg-muted hover:bg-muted/85 text-foreground rounded-xl disabled:opacity-40 transition-colors border border-black/5 dark:border-white/5 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="text-[13px] text-muted-foreground font-medium">
                    Página <span className="font-bold text-foreground">{currentPage}</span> de <span className="font-bold text-foreground">{totalPages}</span>
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest bg-muted hover:bg-muted/85 text-foreground rounded-xl disabled:opacity-40 transition-colors border border-black/5 dark:border-white/5 cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}

          {view === "ciclos" && (
            <div className="flex flex-col gap-6">
              {filteredCycleSummaries.map((entry) => (
                 <div key={entry.cycle.id} className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 overflow-hidden shadow-sm">
                    <div className="p-4 sm:p-5 flex flex-col gap-3.5">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="space-y-1">
                             <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ciclo #{entry.cycle.cycle_number}</span>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded text-[9px] ${entry.cycle.closed_at ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>
                                   {entry.cycle.closed_at ? "Cerrado" : "Abierto"}
                                </span>
                                <span className="text-muted-foreground/30">•</span>
                                <span className="font-['Space_Grotesk',sans-serif] text-[15px] sm:text-[18px] font-bold text-foreground">Día {entry.cycle.business_day}</span>
                             </div>
                             <p className="text-muted-foreground text-[11px] sm:text-[12px] font-medium flex items-center gap-1.5 flex-wrap">
                                <Calendar size={13} className="text-muted-foreground/80 shrink-0" />
                                <span>Operación: {formatDateTime(entry.cycle.opened_at)} - {formatDateTime(entry.cycle.closed_at)}</span>
                             </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                             <div className="flex items-center gap-4 sm:gap-5 bg-muted/45 dark:bg-white/[0.02] rounded-xl px-4 py-2 border border-black/5 dark:border-white/5 min-w-0">
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">Vendido</span>
                                   <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px] sm:text-[15px] text-foreground tabular-nums">{RD(entry.totalSold)}</span>
                                </div>
                                <div className="w-[1px] h-6 bg-black/10 dark:bg-white/10" />
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">Gastos</span>
                                   <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px] sm:text-[15px] text-primary tabular-nums">{RD(entry.totalExpenses)}</span>
                                </div>
                                <div className="w-[1px] h-6 bg-black/10 dark:bg-white/10" />
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-muted-foreground/80 tracking-wider">Neto</span>
                                   <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[13px] sm:text-[15px] tabular-nums ${entry.netTotal >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                                      {RD(entry.netTotal)}
                                   </span>
                                </div>
                             </div>

                             {entry.cycle.closed_at && (
                                <button
                                   type="button"
                                   onClick={() => void printCycleReport(entry)}
                                   className="inline-flex items-center gap-1.5 rounded-xl bg-muted hover:bg-black/5 dark:hover:bg-white/10 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-foreground border border-border cursor-pointer transition-colors"
                                >
                                   <Printer size={13} />
                                   Reimprimir
                                </button>
                             )}
                          </div>
                       </div>

                       <button onClick={() => setExpandedCycleId(expandedCycleId === entry.cycle.id ? null : entry.cycle.id)} className="flex items-center gap-1.5 text-primary font-bold text-[11px] sm:text-[12px] uppercase tracking-wider hover:opacity-80 transition-all border-none bg-transparent cursor-pointer self-start">
                          {expandedCycleId === entry.cycle.id ? "Ocultar detalle" : "Ver detalle de ciclo"}
                          <ChevronDown size={14} className={`transition-transform ${expandedCycleId === entry.cycle.id ? "rotate-180" : ""}`} />
                       </button>
                       
                       {expandedCycleId === entry.cycle.id && (
                          <div className="pt-3.5 border-t border-black/10 dark:border-white/5 animate-in fade-in slide-in-from-top-2 grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
                             <div>
                               <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Por Categoría</div>
                               <div className="space-y-3">
                                  {entry.categoryBreakdown.length > 0 ? entry.categoryBreakdown.map((cat, idx) => {
                                    const percent = entry.totalSold > 0 ? (cat.total / entry.totalSold) * 100 : 0;
                                    return (
                                      <div key={idx} className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                          <div className="flex flex-col">
                                            <span className="text-foreground font-semibold text-[14px]">{cat.category}</span>
                                            <span className="text-muted-foreground text-[11px]">{cat.count} productos</span>
                                          </div>
                                          <div className="text-right flex flex-col items-end">
                                            <span className="font-bold text-[14px] text-foreground">{RD(cat.total)}</span>
                                            <span className="text-[11px] text-muted-foreground font-semibold">{percent.toFixed(0)}%</span>
                                          </div>
                                        </div>
                                        <div className="w-full bg-black/5 dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                          <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                                        </div>
                                      </div>
                                    );
                                  }) : (
                                    <div className="text-muted-foreground text-[13px] italic">No hay productos vendidos en este ciclo.</div>
                                  )}
                               </div>
                             </div>
                             <div>
                               <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Por Método de Pago</div>
                               <div className="space-y-3">
                                  {entry.methodBreakdown.length > 0 ? entry.methodBreakdown.map((met, idx) => {
                                    const percent = entry.totalSold > 0 ? (met.total / entry.totalSold) * 100 : 0;
                                    return (
                                      <div key={idx} className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                          <div className="flex flex-col">
                                            <span className="text-foreground font-semibold text-[14px]">{met.label}</span>
                                            <span className="text-muted-foreground text-[11px]">{met.count} facturas</span>
                                          </div>
                                          <div className="text-right flex flex-col items-end">
                                            <span className="font-bold text-[14px] text-foreground">{RD(met.total)}</span>
                                            <span className="text-[11px] text-muted-foreground font-semibold">{percent.toFixed(0)}%</span>
                                          </div>
                                        </div>
                                        <div className="w-full bg-black/5 dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                          <div className="bg-green-600 dark:bg-green-500 h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                                        </div>
                                      </div>
                                    );
                                  }) : (
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

                                 {entry.expenseCategoryBreakdown.length > 0 ? entry.expenseCategoryBreakdown.map((cat, idx) => {
                                   const percent = entry.totalExpenses > 0 ? (cat.total / entry.totalExpenses) * 100 : 0;
                                   return (
                                     <div key={idx} className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 flex flex-col gap-2">
                                       <div className="flex justify-between items-start">
                                         <div className="flex items-center gap-2">
                                           <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#ff906d" }} />
                                           <div className="flex flex-col">
                                             <span className="text-foreground font-semibold text-[14px]">{cat.category}</span>
                                             <span className="text-muted-foreground text-[11px]">{cat.count} gastos</span>
                                           </div>
                                         </div>
                                         <div className="text-right flex flex-col items-end">
                                           <span className="font-bold text-[14px] text-foreground">{RD(cat.total)}</span>
                                           <span className="text-[11px] text-muted-foreground font-semibold">{percent.toFixed(0)}%</span>
                                         </div>
                                       </div>
                                       <div className="w-full bg-black/5 dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                         <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: cat.color || "#ff906d" }} />
                                       </div>
                                     </div>
                                   );
                                 }) : (
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

          {view === "finanzas" && (
            <div className="flex flex-col gap-6">
              {/* Top 5 Debtor & Creditor Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top 5 Debtors */}
                <div className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-5 flex flex-col gap-4 shadow-sm">
                  <h3 className="font-['Space_Grotesk',sans-serif] text-foreground text-[16px] font-bold pb-2 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                    <span>Top 5 Clientes Deudores</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold font-['Inter']">Por saldo</span>
                  </h3>
                  <div className="flex flex-col gap-3">
                    {finanzasData.topDebtors.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-4">
                        No hay deudas de clientes activas.
                      </div>
                    ) : (
                      finanzasData.topDebtors.map((debtor) => (
                        <div key={debtor.id} className="flex justify-between items-center py-1">
                          <span className="text-sm font-medium text-foreground truncate max-w-[180px]">{debtor.name}</span>
                          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-amber-600 dark:text-amber-400 tabular-nums">
                            {RD(debtor.deuda)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top 5 Creditors */}
                <div className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-5 flex flex-col gap-4 shadow-sm">
                  <h3 className="font-['Space_Grotesk',sans-serif] text-foreground text-[16px] font-bold pb-2 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                    <span>Top 5 Proveedores Acreedores</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold font-['Inter']">Por saldo</span>
                  </h3>
                  <div className="flex flex-col gap-3">
                    {finanzasData.topCreditors.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-4">
                        No hay deudas con proveedores activas.
                      </div>
                    ) : (
                      finanzasData.topCreditors.map((creditor) => (
                        <div key={creditor.id} className="flex justify-between items-center py-1">
                          <span className="text-sm font-medium text-foreground truncate max-w-[180px]">{creditor.name}</span>
                          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-rose-600 dark:text-rose-400 tabular-nums">
                            {RD(creditor.deuda)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Consolidated Transaction Log */}
              <div className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-5 border-b border-black/5 dark:border-white/5 flex justify-between items-center">
                  <h3 className="font-['Space_Grotesk',sans-serif] text-foreground text-[18px] font-bold">Registro de Transacciones</h3>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {filteredTransacciones.length} transacciones encontradas
                  </span>
                </div>

                {/* Desktop view */}
                <div className="hidden md:block overflow-x-auto">
                  <div className="min-w-[700px] p-5 flex flex-col gap-3">
                    {/* Header Row */}
                    <div className="grid grid-cols-[100px_130px_1fr_120px_110px_130px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 pb-2 border-b border-black/5 dark:border-white/5">
                      <div>Tipo</div>
                      <div>Fecha</div>
                      <div>Detalle</div>
                      <div>Referencia</div>
                      <div>Método</div>
                      <div className="text-right">Monto</div>
                    </div>
                    {/* Data Rows */}
                    {transaccionesPageData.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        No se encontraron transacciones en este período.
                      </div>
                    ) : (
                      transaccionesPageData.map((tx) => {
                        const method = getMethodDisplay(tx.metodo);
                        return (
                          <div
                            key={tx.id}
                            className="grid grid-cols-[100px_130px_1fr_120px_110px_130px] items-center px-4 py-3 bg-muted/20 dark:bg-white/[0.01] hover:bg-muted/40 dark:hover:bg-white/[0.03] transition-all rounded-xl"
                          >
                            <div>
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                  tx.tipo === "ingreso"
                                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {tx.tipo === "ingreso" ? "Cobro" : "Abono"}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground font-medium">{formatDateTime(tx.fecha)}</div>
                            <div className="text-sm font-semibold text-foreground truncate pr-4">{tx.descripcion}</div>
                            <div className="text-xs font-semibold text-muted-foreground">{tx.referencia}</div>
                            <div>
                              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${method.pillClass}`}>
                                {method.label}
                              </span>
                            </div>
                            <div
                              className={`text-right font-['Space_Grotesk',sans-serif] font-bold text-[15px] tabular-nums ${
                                tx.tipo === "ingreso" ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {tx.tipo === "ingreso" ? "+" : "-"}{RD(tx.monto)}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Mobile view */}
                <div className="md:hidden flex flex-col gap-3 p-4">
                  {transaccionesPageData.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      No se encontraron transacciones.
                    </div>
                  ) : (
                    transaccionesPageData.map((tx) => {
                      const method = getMethodDisplay(tx.metodo);
                      return (
                        <div
                          key={tx.id}
                          className="rounded-[20px] border border-black/10 bg-card p-4 shadow-sm dark:border-white/5 bg-muted/10"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span
                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                                  tx.tipo === "ingreso"
                                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {tx.tipo === "ingreso" ? "Cobro" : "Abono"}
                              </span>
                              <div className="mt-1 font-semibold text-foreground text-sm">{tx.descripcion}</div>
                              <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                                {formatDateTime(tx.fecha)}
                              </div>
                            </div>
                            <div
                              className={`text-right font-['Space_Grotesk',sans-serif] text-md font-bold tabular-nums ${
                                tx.tipo === "ingreso" ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {tx.tipo === "ingreso" ? "+" : "-"}{RD(tx.monto)}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl bg-muted/50 p-2">
                              <div className="text-[9px] font-bold uppercase text-muted-foreground">Referencia</div>
                              <div className="mt-0.5 font-semibold text-foreground">{tx.referencia}</div>
                            </div>
                            <div className="rounded-xl bg-muted/50 p-2">
                              <div className="text-[9px] font-bold uppercase text-muted-foreground">Método</div>
                              <div className="mt-0.5 font-semibold text-foreground">{method.label}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-4 border-t border-black/5 dark:border-white/5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest bg-muted hover:bg-muted/85 text-foreground rounded-xl disabled:opacity-40 transition-colors border border-black/5 dark:border-white/5 cursor-pointer"
                    >
                      Anterior
                    </button>
                    <span className="text-[13px] text-muted-foreground font-medium">
                      Página <span className="font-bold text-foreground">{currentPage}</span> de{" "}
                      <span className="font-bold text-foreground">{totalPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest bg-muted hover:bg-muted/85 text-foreground rounded-xl disabled:opacity-40 transition-colors border border-black/5 dark:border-white/5 cursor-pointer"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Summary Counter */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="bg-card rounded-[20px] border border-black/10 dark:border-white/5 p-5 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center gap-2 pb-2 border-b border-black/5 dark:border-white/5">
              <TrendingUp size={16} className="text-green-600 dark:text-green-400" />
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px] uppercase tracking-wider text-foreground">
                {view === "facturas" ? "Resumen Filtrado" : view === "finanzas" ? "Resumen Financiero" : "Resumen de Ciclos"}
              </span>
            </div>

            {view === "facturas" && (
              <div className="flex flex-col gap-3.5">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Monto Pagado:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-green-600 dark:text-green-400">{RD(filteredStats.total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Cantidad:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-foreground">{filteredStats.count} facturas</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Ticket Promedio:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-foreground">{RD(filteredStats.avg)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Método Principal:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-primary">{filteredStats.mainMethodLabel}</span>
                </div>
              </div>
            )}

            {view === "finanzas" && (
              <div className="flex flex-col gap-3.5">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Total Cobros:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-green-600 dark:text-green-400">
                    {RD(finanzasData.totalCobros)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Total Abonos:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-rose-600 dark:text-rose-400">
                    {RD(finanzasData.totalAbonos)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-black/5 dark:border-white/5 pt-3.5">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-bold">Balance Neto:</span>
                  {(() => {
                    const net = finanzasData.totalCobros - finanzasData.totalAbonos;
                    return (
                      <span
                        className={`font-['Space_Grotesk',sans-serif] font-bold text-[16px] ${
                          net >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                        }`}
                      >
                        {net >= 0 ? "+" : ""}{RD(net)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}

            {view === "ciclos" && (
              <div className="flex flex-col gap-3.5">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Ciclos Filtrados:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-foreground">{filteredCycleSummaries.length} ciclos</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Vendido Total:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-foreground">
                    {RD(filteredCycleSummaries.reduce((sum, c) => sum + c.totalSold, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-medium">Gastos Total:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-primary">
                    {RD(filteredCycleSummaries.reduce((sum, c) => sum + c.totalExpenses, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-black/5 dark:border-white/5 pt-3.5">
                  <span className="text-[12px] text-muted-foreground font-['Inter'] font-bold">Balance Neto:</span>
                  {(() => {
                    const net = filteredCycleSummaries.reduce((sum, c) => sum + c.netTotal, 0);
                    return (
                      <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[16px] ${net >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                        {RD(net)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={invoiceModal !== null} onOpenChange={(open) => !open && setInvoiceModal(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-black/10 dark:border-white/10 bg-card text-foreground sm:max-w-lg">
          {invoiceModal && (
            <>
              <DialogHeader>
                <DialogTitle className="font-['Space_Grotesk',sans-serif] text-xl">Factura #{String(invoiceModal.numero_factura).padStart(4, "0")}</DialogTitle>
                <DialogDescription className="text-muted-foreground">{formatDateTime(invoiceModal.created_at)} · {invoiceModal.mesa_numero ? `Mesa ${invoiceModal.mesa_numero}` : "Para llevar"}</DialogDescription>
              </DialogHeader>
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
                 {invoiceModal.monto_recibido != null && invoiceModal.cambio_devuelto != null ? (
                   <>
                     <div className="flex justify-between text-muted-foreground"><span>Dinero recibido</span><span>{RD(Number(invoiceModal.monto_recibido))}</span></div>
                     <div className="flex justify-between text-muted-foreground"><span>Cambio</span><span>{RD(Number(invoiceModal.cambio_devuelto))}</span></div>
                   </>
                 ) : null}
                 {(() => {
                    const ecfDoc = ecfDocuments.get(invoiceModal.id);
                    if (!ecfDoc) return null;
                    const ecfDisplay = getEcfStatusDisplay(ecfDoc.status);
                    return (
                      <div className="mt-4 p-4 rounded-2xl bg-muted/30 border border-border space-y-2 text-xs">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase">Facturación Electrónica (e-CF)</div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Estado Fiscal</span>
                          <span className="font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase border" style={{ borderColor: ecfDisplay.color + "44", color: ecfDisplay.color, backgroundColor: ecfDisplay.bg }}>
                            {ecfDisplay.label.replace("e-CF: ", "")}
                          </span>
                        </div>
                        {ecfDoc.dgii_track_id && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Track ID (DGII)</span>
                            <span className="font-mono text-foreground font-semibold">{ecfDoc.dgii_track_id}</span>
                          </div>
                        )}
                        {ecfDoc.last_error && (
                          <div className="pt-2 mt-2 border-t border-dashed border-border text-destructive">
                            <div className="font-bold uppercase text-[9px]">Detalle Error:</div>
                            <div className="font-medium mt-0.5 leading-relaxed">{ecfDoc.last_error}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
