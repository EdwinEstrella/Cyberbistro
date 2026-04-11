import { useState, useEffect, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";

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
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");

  // Stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);

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
    applyFilters();
  }, [invoices, statusFilter, methodFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, methodFilter]);

  function applyFilters() {
    let filtered = invoices;

    if (statusFilter !== "todos") {
      filtered = filtered.filter((inv) => inv.estado === statusFilter);
    }

    if (methodFilter !== "todos") {
      filtered = filtered.filter((inv) => inv.metodo_pago === methodFilter);
    }

    setFilteredInvoices(filtered);

    // Calculate stats
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentInvoices = invoices.filter((inv) => new Date(inv.created_at) > last24h && inv.estado === "pagada");
    setTotalRevenue(recentInvoices.reduce((sum, inv) => sum + inv.total, 0));

    const pending = invoices.filter((inv) => inv.estado === "pendiente");
    setPendingCount(pending.length);
    setPendingAmount(pending.reduce((sum, inv) => sum + inv.total, 0));
  }

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = filteredInvoices.slice(startIndex, endIndex);

  function getMethodIcon(method: string) {
    switch (method) {
      case "efectivo":
        return { icon: "💵", label: "Efectivo" };
      case "tarjeta":
        return { icon: "💳", label: "Tarjeta" };
      case "digital":
        return { icon: "📱", label: "Digital" };
      default:
        return { icon: "💵", label: method };
    }
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
    <div className="flex-1 p-4 sm:p-6 lg:p-[32px] flex flex-col gap-4 sm:gap-6 lg:gap-[32px] overflow-auto">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-[24px]">
        {/* Revenue */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden relative">
          <div className="flex flex-col gap-[16px] p-[24px] pb-[54px]">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase">
              Ingreso Total (24h)
            </div>
            <div className="flex items-end">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[48px] tracking-[-1.2px]">
                {RD(totalRevenue).replace("RD$ ", "")}
              </span>
            </div>
            <div className="flex gap-[8px] items-center">
              <span className="font-['Inter',sans-serif] font-medium text-[#59ee50] text-[14px]">
                Facturas recientes
              </span>
            </div>
          </div>
          <div className="absolute bg-[rgba(255,144,109,0.05)] blur-[32px] right-[-16px] rounded-full size-[96px] top-[-16px]" />
        </div>

        {/* Average Ticket */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden">
          <div className="flex flex-col gap-[16px] p-[24px] pb-[54px]">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase">
              Ticket Promedio
            </div>
            <div className="flex items-end">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[48px] tracking-[-1.2px]">
                {invoices.length > 0 ? RD(invoices.reduce((sum, inv) => sum + inv.total, 0) / invoices.length).replace("RD$ ", "") : "RD$ 0"}
              </span>
            </div>
            <div className="flex gap-[8px] items-center">
              <div className="bg-white/40 h-px w-[9px]" />
              <span className="font-['Inter',sans-serif] font-medium text-white/40 text-[14px]">
                {invoices.length} facturas totales
              </span>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden">
          <div className="flex flex-col gap-[16px] p-[24px] pb-[34px]">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase">
              Facturas Pendientes
            </div>
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[48px] tracking-[-1.2px]">
              {pendingCount}
            </div>
            <div className="flex gap-[8px] items-center">
              <span className="font-['Inter',sans-serif] font-medium text-[#ff6aa0] text-[14px]">
                {RD(pendingAmount)} en espera
              </span>
            </div>
          </div>
        </div>

        {/* Total Invoices */}
        <div className="bg-[#131313] rounded-[24px] border border-[rgba(255,144,109,0.05)]">
          <div className="flex flex-col justify-between p-[25px] h-full">
            <div className="flex items-start justify-between">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase">Total Facturas</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[28px]">
                {invoices.length}
              </span>
            </div>
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">
              Registradas en el sistema
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] rounded-[16px] border border-[rgba(255,255,255,0.05)] p-[12px] sm:p-[17px] flex flex-wrap items-center gap-[12px] justify-between">
        <div className="flex flex-wrap gap-[8px] sm:gap-[16px] items-center">
          <div className="bg-black rounded-[12px] border border-[rgba(72,72,71,0.3)] flex items-center px-[17px] py-[9px] gap-[8px]">
            <span className="font-['Inter',sans-serif] text-white text-[14px]">Todas las fechas</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-black rounded-[12px] border border-[rgba(72,72,71,0.3)] flex items-center px-[17px] py-[9px] gap-[8px] font-['Inter',sans-serif] text-white text-[14px] cursor-pointer"
          >
            <option value="todos">Todos los Estados</option>
            <option value="pagada">Pagadas</option>
            <option value="pendiente">Pendientes</option>
            <option value="cancelada">Canceladas</option>
          </select>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-black rounded-[12px] border border-[rgba(72,72,71,0.3)] flex items-center px-[17px] py-[9px] gap-[8px] font-['Inter',sans-serif] text-white text-[14px] cursor-pointer"
          >
            <option value="todos">Todos los Métodos</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="digital">Digital</option>
          </select>
        </div>
        <button
          onClick={() => loadInvoices()}
          className="bg-[#262626] rounded-[12px] border border-[rgba(72,72,71,0.2)] flex gap-[8px] items-center px-[25px] py-[9px] cursor-pointer hover:border-[rgba(255,144,109,0.3)] transition-colors"
        >
          <span className="font-['Inter',sans-serif] text-white text-[16px]">↻ Actualizar</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[24px]">
        <div className="bg-[#131313] rounded-[24px] border border-[rgba(72,72,71,0.1)] overflow-hidden min-w-[760px]">
          {/* Header Row */}
          <div className="bg-[rgba(32,31,31,0.5)] grid grid-cols-[100px_120px_1fr_110px_130px_120px_140px] px-[32px]">
            {["ID\nFactura", "Fecha", "Mesa", "Método", "Estado", "Monto", "Acciones"].map((h, i) => (
              <div key={i} className={`py-[20px] ${i >= 5 ? "text-right" : ""}`}>
                <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[10px] tracking-[2px] uppercase whitespace-pre-line">{h}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {pageData.length === 0 ? (
            <div className="px-[32px] py-[40px] text-center">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[14px]">
                No se encontraron facturas
              </span>
            </div>
          ) : (
            pageData.map((inv, idx) => {
              const status = statusConfig[inv.estado];
              const method = getMethodIcon(inv.metodo_pago);
              const date = new Date(inv.created_at);
              return (
                <div key={inv.id} className={`grid grid-cols-[100px_120px_1fr_110px_130px_120px_140px] px-[32px] items-center ${idx > 0 ? "border-t border-[rgba(255,255,255,0.05)]" : ""}`}>
                  {/* ID */}
                  <div className="py-[32px]">
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px]">
                      #{String(inv.numero_factura).padStart(4, "0")}
                    </span>
                  </div>
                  {/* Date */}
                  <div className="py-[32px]">
                    <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px]">
                      {date.toLocaleDateString("es-DO")}
                    </div>
                    <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] opacity-50">
                      {date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {/* Table */}
                  <div className="py-[32px] flex gap-[12px] items-center">
                    <div
                      className="rounded-[8px] flex items-center justify-center h-[32px] px-[8px] min-w-[32px]"
                      style={{
                        backgroundColor:
                          inv.mesa_numero != null && inv.mesa_numero !== 0
                            ? "rgba(255,144,109,0.1)"
                            : "rgba(89,238,80,0.1)",
                      }}
                    >
                      <span
                        className="font-['Inter',sans-serif] font-bold text-[12px]"
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
                    <div>
                      <div className="font-['Inter',sans-serif] font-medium text-white text-[14px]">
                        {inv.mesa_numero != null && inv.mesa_numero !== 0
                          ? `Mesa ${inv.mesa_numero}`
                          : "Para llevar"}
                      </div>
                      <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px]">
                        {itemCount(inv)} productos
                      </div>
                    </div>
                  </div>
                  {/* Method */}
                  <div className="py-[32px] flex gap-[8px] items-center">
                    <span className="text-[16px]">{method.icon}</span>
                    <span className="font-['Inter',sans-serif] text-[rgba(255,255,255,0.7)] text-[12px]">
                      {method.label}
                    </span>
                  </div>
                  {/* Status */}
                  <div className="py-[32px]">
                    <div className="flex gap-[6px] items-center px-[12px] py-[4px] rounded-full w-fit" style={{ backgroundColor: status.bg, boxShadow: status.shadow }}>
                      <div className="rounded-full size-[6px]" style={{ backgroundColor: status.color }} />
                      <span className="font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase" style={{ color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  {/* Amount */}
                  <div className="py-[32px] text-right">
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[18px]" style={{ color: inv.estado === "cancelada" ? "#d7383b" : "white" }}>
                      {RD(inv.total)}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="py-[32px] flex gap-[8px] justify-end">
                    <button className="bg-[#262626] rounded-[8px] size-[32px] flex items-center justify-center border-none cursor-pointer hover:bg-[#333] transition-colors" title="Ver detalles">
                      👁
                    </button>
                    <button className="bg-[#262626] rounded-[8px] size-[32px] flex items-center justify-center border-none cursor-pointer hover:bg-[#333] transition-colors" title="Imprimir">
                      🖨
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Pagination */}
          {filteredInvoices.length > 0 && (
            <div className="border-t border-[rgba(255,255,255,0.05)] px-[16px] sm:px-[32px] py-[16px] sm:py-[24px] flex flex-wrap items-center gap-[12px] justify-between">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px]">
                Mostrando <span className="text-white font-bold">{startIndex + 1} - {Math.min(endIndex, filteredInvoices.length)}</span> de <span className="text-white font-bold">{filteredInvoices.length}</span> facturas
              </span>
              <div className="flex gap-[8px] items-center">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="size-[32px] rounded-[8px] bg-[#262626] flex items-center justify-center border-none cursor-pointer disabled:opacity-50"
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
                      onClick={() => setCurrentPage(pageNum)}
                      className={`size-[32px] rounded-[8px] flex items-center justify-center border-none cursor-pointer font-['Inter',sans-serif] font-bold text-[12px] ${
                        currentPage === pageNum ? "bg-[#59ee50] text-black" : "bg-[#262626] text-white/50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 3 && currentPage < totalPages - 1 && (
                  <span className="font-['Inter',sans-serif] text-white/30 text-[12px]">...</span>
                )}
                {totalPages > 3 && (
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className={`size-[32px] rounded-[8px] flex items-center justify-center border-none cursor-pointer font-['Inter',sans-serif] font-bold text-[12px] ${
                      currentPage === totalPages ? "bg-[#59ee50] text-black" : "bg-[#262626] text-white/50"
                    }`}
                  >
                    {totalPages}
                  </button>
                )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="size-[32px] rounded-[8px] bg-[#262626] flex items-center justify-center border-none cursor-pointer disabled:opacity-50"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
