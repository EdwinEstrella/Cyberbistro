import { useState, useEffect, useCallback, useMemo } from "react";
import { Eye, Printer, Trash2 } from "lucide-react";
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

interface InvoiceItem {
  plato_id: number;
  nombre: string;
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

export function Billing() {
  const { tenantId, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [invoiceModal, setInvoiceModal] = useState<Invoice | null>(null);
  const [deletePinInvoice, setDeletePinInvoice] = useState<Invoice | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    if (!tenantId) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await insforgeClient.database
      .from("facturas")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInvoices(data as Invoice[]);
    } else {
      setInvoices([]);
    }
    setCurrentPage(1);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (authLoading) return;
    void loadInvoices();
  }, [authLoading, loadInvoices]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, methodFilter]);

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (statusFilter !== "todos") {
      filtered = filtered.filter((inv) => inv.estado === statusFilter);
    }
    if (methodFilter !== "todos") {
      filtered = filtered.filter((inv) => inv.metodo_pago === methodFilter);
    }
    return filtered;
  }, [invoices, statusFilter, methodFilter]);

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

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = useMemo(
    () => filteredInvoices.slice(startIndex, endIndex),
    [filteredInvoices, startIndex, endIndex]
  );

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
        console.warn("Impresión factura:", res.error);
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
      await loadInvoices();
      setDeletingInvoiceId(null);
    },
    [tenantId, loadInvoices]
  );

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
          Tu usuario no está vinculado a un negocio. Las analíticas solo muestran facturas de tu
          negocio (multitenant).
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando facturas...
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-5 sm:p-8 lg:p-10 flex flex-col gap-6 sm:gap-8 lg:gap-10 overflow-auto max-w-[1600px] w-full mx-auto">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6">
        {/* Revenue */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden relative min-h-[200px]">
          <div className="flex flex-col gap-5 p-6 sm:p-8 pb-14">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] tracking-wide uppercase">
              Ingreso Total (24h)
            </div>
            <div className="flex items-end min-h-[3.5rem]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[40px] sm:text-[44px] tracking-tight leading-none">
                {RD(totalRevenue).replace("RD$ ", "")}
              </span>
            </div>
            <div className="flex gap-2 items-center pt-1">
              <span className="font-['Inter',sans-serif] font-medium text-[#59ee50] text-[15px] leading-snug">
                Facturas recientes
              </span>
            </div>
          </div>
          <div className="absolute bg-[rgba(255,144,109,0.05)] blur-[32px] right-[-16px] rounded-full size-[96px] top-[-16px]" />
        </div>

        {/* Average Ticket */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden min-h-[200px]">
          <div className="flex flex-col gap-5 p-6 sm:p-8 pb-14">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] tracking-wide uppercase">
              Ticket Promedio
            </div>
            <div className="flex items-end min-h-[3.5rem]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[40px] sm:text-[44px] tracking-tight leading-none">
                {invoices.length > 0 ? RD(invoices.reduce((sum, inv) => sum + inv.total, 0) / invoices.length).replace("RD$ ", "") : "RD$ 0"}
              </span>
            </div>
            <div className="flex gap-3 items-center pt-1">
              <div className="bg-white/40 h-px w-3 shrink-0" />
              <span className="font-['Inter',sans-serif] font-medium text-white/40 text-[15px] leading-snug">
                {invoices.length} facturas totales
              </span>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden min-h-[200px]">
          <div className="flex flex-col gap-5 p-6 sm:p-8 pb-10">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] tracking-wide uppercase">
              Facturas Pendientes
            </div>
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[40px] sm:text-[44px] tracking-tight leading-none min-h-[3.5rem] flex items-end">
              {pendingCount}
            </div>
            <div className="flex gap-2 items-center pt-1">
              <span className="font-['Inter',sans-serif] font-medium text-[#ff6aa0] text-[15px] leading-snug">
                {RD(pendingAmount)} en espera
              </span>
            </div>
          </div>
        </div>

        {/* Total Invoices */}
        <div className="bg-[#131313] rounded-[24px] border border-[rgba(255,144,109,0.05)] min-h-[200px]">
          <div className="flex flex-col justify-between gap-6 p-6 sm:p-8 h-full min-h-[200px]">
            <div className="flex items-start justify-between gap-4">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] tracking-wide uppercase leading-relaxed max-w-[60%]">
                Total Facturas
              </span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[32px] shrink-0 tabular-nums">
                {invoices.length}
              </span>
            </div>
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] leading-relaxed">
              Registradas en el sistema
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] rounded-2xl border border-[rgba(255,255,255,0.05)] p-4 sm:p-5 flex flex-wrap items-center gap-4 sm:gap-5 justify-between">
        <div className="flex flex-wrap gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="bg-black rounded-xl border border-[rgba(72,72,71,0.3)] flex items-center px-5 py-3 min-h-[44px]">
            <span className="font-['Inter',sans-serif] text-white text-[15px]">Todas las fechas</span>
          </div>
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
            <option value="todos">Todos los Métodos</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="digital">Digital</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>
        <button
          onClick={() => loadInvoices()}
          className="bg-[#262626] rounded-xl border border-[rgba(72,72,71,0.2)] flex gap-2 items-center px-6 py-3 min-h-[44px] cursor-pointer hover:border-[rgba(255,144,109,0.3)] transition-colors shrink-0"
        >
          <span className="font-['Inter',sans-serif] text-white text-[15px]">↻ Actualizar</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[24px] -mx-1 px-1">
        <div className="bg-[#131313] rounded-[24px] border border-[rgba(72,72,71,0.1)] overflow-hidden min-w-[920px]">
          {/* Header Row — columnas más anchas y texto legible */}
          <div className="bg-[rgba(32,31,31,0.5)] grid grid-cols-[minmax(7rem,8rem)_minmax(8.5rem,10rem)_minmax(11rem,1.2fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_minmax(7.5rem,9rem)_minmax(9.5rem,11rem)] px-6 sm:px-10 gap-x-4">
            {["ID\nFactura", "Fecha", "Mesa", "Método", "Estado", "Monto", "Acciones"].map((h, i) => (
              <div key={i} className={`py-6 ${i >= 5 ? "text-right" : ""}`}>
                <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[11px] sm:text-xs tracking-[0.12em] uppercase whitespace-pre-line leading-relaxed block">
                  {h}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
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
                  className={`grid grid-cols-[minmax(7rem,8rem)_minmax(8.5rem,10rem)_minmax(11rem,1.2fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_minmax(7.5rem,9rem)_minmax(9.5rem,11rem)] px-6 sm:px-10 gap-x-4 items-center ${idx > 0 ? "border-t border-[rgba(255,255,255,0.05)]" : ""}`}
                >
                  {/* ID */}
                  <div className="py-9">
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[17px] tabular-nums">
                      #{String(inv.numero_factura).padStart(4, "0")}
                    </span>
                  </div>
                  {/* Date */}
                  <div className="py-9 space-y-1.5">
                    <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[15px] leading-snug">
                      {date.toLocaleDateString("es-DO")}
                    </div>
                    <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] opacity-60">
                      {date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {/* Mesa / tipo */}
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
                  {/* Method */}
                  <div className="py-9 flex items-center">
                    <span
                      className={`font-['Inter',sans-serif] text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md shrink-0 ${method.pillClass}`}
                    >
                      {method.label}
                    </span>
                  </div>
                  {/* Status */}
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
                  {/* Amount */}
                  <div className="py-9 text-right">
                    <span
                      className="font-['Space_Grotesk',sans-serif] font-bold text-[19px] tabular-nums inline-block"
                      style={{ color: inv.estado === "cancelada" ? "#d7383b" : "white" }}
                    >
                      {RD(inv.total)}
                    </span>
                  </div>
                  {/* Actions */}
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

          {/* Pagination */}
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
                  ←
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
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
                        <span className="font-['Inter',sans-serif] text-[rgba(255,255,255,0.9)] min-w-0 break-words">
                          {line.nombre}
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
          subtitle={`Factura #${String(deletePinInvoice.numero_factura).padStart(4, "0")}. Ingresá la misma clave que en Soporte para borrar el registro y desvincular líneas de mesa.`}
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
