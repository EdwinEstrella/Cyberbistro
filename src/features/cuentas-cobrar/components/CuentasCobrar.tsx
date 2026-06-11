import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, DollarSign, FileText, CheckCircle, Clock, Eye } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useSucursal } from "../../../app/context/SucursalContext";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { insforgeClient } from "../../../shared/lib/insforge";
import { RegistrarPagoCxCModal } from "./RegistrarPagoCxCModal";
import { DetalleCuentaCobrarModal } from "./DetalleCuentaCobrarModal";

interface CustomerRow {
  id: string;
  name: string;
}

interface FacturaRow {
  id: string;
  numero_factura: number | null;
}

interface CuentaCobrarRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  factura_id: string | null;
  customer_id: string;
  monto_total: number;
  monto_pagado: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: "pendiente" | "parcial" | "pagada";
  observacion: string | null;
}

interface CxcPagoRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  cuenta_cobrar_id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
  notas: string | null;
}

const RD = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-DO", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function CuentasCobrar() {
  const { tenantId, user } = useAuth();
  const { activeSucursalId } = useSucursal();

  const [activeTab, setActiveTab] = useState<'pendientes' | 'pagadas' | 'pagos'>('pendientes');

  // Data state
  const [cuentas, setCuentas] = useState<CuentaCobrarRow[]>([]);
  const [pagos, setPagos] = useState<CxcPagoRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [cicloAbierto, setCicloAbierto] = useState<{ id: string; closed_at: string | null; opened_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Payment Modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaCobrarRow | null>(null);

  // Details Modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailCuenta, setDetailCuenta] = useState<CuentaCobrarRow | null>(null);

  function openDetailModal(cuenta: CuentaCobrarRow) {
    setDetailCuenta(cuenta);
    setShowDetailModal(true);
  }

  const cargarDatos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage("");
    try {
      const useLocal = await shouldReadLocalFirst(tenantId, [
        "cuentas_cobrar",
        "cxc_pagos",
        "customers",
        "facturas",
        "cierres_operativos",
      ]);

      let cuentasData: CuentaCobrarRow[] = [];
      let pagosData: CxcPagoRow[] = [];
      let customersData: CustomerRow[] = [];
      let facturasData: FacturaRow[] = [];
      let ciclosData: any[] = [];

      if (useLocal) {
        cuentasData = await readLocalMirror<CuentaCobrarRow>(tenantId, "cuentas_cobrar");
        pagosData = await readLocalMirror<CxcPagoRow>(tenantId, "cxc_pagos");
        customersData = await readLocalMirror<CustomerRow>(tenantId, "customers");
        facturasData = await readLocalMirror<FacturaRow>(tenantId, "facturas");
        ciclosData = await readLocalMirror<any>(tenantId, "cierres_operativos");
      } else {
        const [cRes, paRes, cuRes, fRes, cyRes] = await Promise.all([
          insforgeClient.database.from("cuentas_cobrar").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("cxc_pagos").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("customers").select("id, name").eq("tenant_id", tenantId),
          insforgeClient.database.from("facturas").select("id, numero_factura").eq("tenant_id", tenantId),
          insforgeClient.database.from("cierres_operativos").select("id, cycle_number, opened_at, closed_at, sucursal_id").eq("tenant_id", tenantId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1),
        ]);
        cuentasData = cRes.data || [];
        pagosData = paRes.data || [];
        customersData = cuRes.data || [];
        facturasData = fRes.data || [];
        ciclosData = cyRes.data || [];
      }

      setCuentas(cuentasData);
      setPagos(pagosData.sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago)));
      setCustomers(customersData);
      setFacturas(facturasData);

      const activeCycle = useLocal
        ? ciclosData.filter(c => !c.closed_at && (c.sucursal_id === activeSucursalId || !c.sucursal_id)).sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0] ?? null
        : ciclosData[0] ?? null;
      setCicloAbierto(activeCycle);
    } catch (err: any) {
      setMessage("Error al cargar datos: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeSucursalId]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const customersMap = useMemo(() => {
    return new Map(customers.map(c => [c.id, c.name]));
  }, [customers]);

  const facturasMap = useMemo(() => {
    return new Map(facturas.map(f => [f.id, f.numero_factura]));
  }, [facturas]);

  const stats = useMemo(() => {
    let totalCredito = 0;
    let totalCobrado = 0;
    let pendientesCount = 0;

    cuentas.forEach((c) => {
      const tot = Number(c.monto_total) || 0;
      const pag = Number(c.monto_pagado) || 0;
      if (c.estado !== "pagada") {
        totalCredito += (tot - pag);
        pendientesCount++;
      }
      totalCobrado += pag;
    });

    return { totalCredito, totalCobrado, pendientesCount };
  }, [cuentas]);

  const filteredCuentas = useMemo(() => {
    return cuentas.filter((c) => {
      if (activeTab === "pendientes") return c.estado !== "pagada";
      if (activeTab === "pagadas") return c.estado === "pagada";
      return false;
    }).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
  }, [cuentas, activeTab]);

  function openAbonarModal(cuenta: CuentaCobrarRow) {
    setSelectedCuenta(cuenta);
    setShowPayModal(true);
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 min-h-0 bg-[#0c0c0c] text-white">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-[rgba(72,72,71,0.15)] shrink-0">
        <div>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase tracking-[0.5px]">
            Finanzas e Ingresos
          </span>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] uppercase tracking-[0.5px] mt-0.5">
            Cuentas por Cobrar
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void cargarDatos()}
          className="bg-transparent border border-[rgba(72,72,71,0.3)] hover:border-white text-[#adaaaa] hover:text-white rounded-[10px] p-2.5 transition-colors cursor-pointer"
          title="Refrescar datos"
        >
          <RefreshCw className="size-[16px]" />
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(255,113,108,0.1)] rounded-[10px] p-2.5 text-[#ff716c]">
            <Clock className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Cartera Pendiente</span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] mt-0.5">{RD(stats.totalCredito)}</h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(89,238,80,0.1)] rounded-[10px] p-2.5 text-[#59ee50]">
            <CheckCircle className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Total Recaudado</span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] mt-0.5">{RD(stats.totalCobrado)}</h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(255,144,109,0.1)] rounded-[10px] p-2.5 text-[#ff906d]">
            <FileText className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Clientes Deudores</span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] mt-0.5">{stats.pendientesCount} cuentas</h4>
          </div>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-2.5 shrink-0">
        <button
          onClick={() => setActiveTab('pendientes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === 'pendientes'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <Clock className="size-[15px]" />
          Créditos Pendientes
        </button>
        <button
          onClick={() => setActiveTab('pagadas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === 'pagadas'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <CheckCircle className="size-[15px]" />
          Créditos Pagados
        </button>
        <button
          onClick={() => setActiveTab('pagos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === 'pagos'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <DollarSign className="size-[15px]" />
          Historial de Cobros
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.22)] rounded-[12px] px-4 py-3 shrink-0">
          <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">{message}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.22)] rounded-[12px] px-4 py-3 shrink-0">
          <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando cuentas y créditos...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* TAB 1 & 2: Cuentas por Cobrar List */}
          {activeTab !== 'pagos' && (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                {activeTab === 'pendientes' ? "Créditos Activos" : "Historial de Créditos Cobrados"} ({filteredCuentas.length})
              </span>

              {filteredCuentas.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No se registran créditos en esta categoría.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-[16px] border border-[rgba(72,72,71,0.18)] min-h-0 bg-[#111]">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
                      <tr className="text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.18)]">
                        <th className="px-4 py-3.5">Cliente</th>
                        <th className="px-4 py-3.5">Factura POS</th>
                        <th className="px-4 py-3.5">Emisión</th>
                        <th className="px-4 py-3.5">Vencimiento</th>
                        <th className="px-4 py-3.5 text-right">Monto Total</th>
                        <th className="px-4 py-3.5 text-right">Cobrado</th>
                        <th className="px-4 py-3.5 text-right">Pendiente</th>
                        <th className="px-4 py-3.5 text-center">Estado</th>
                        <th className="px-4 py-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                      {filteredCuentas.map((row) => {
                        const custName = customersMap.get(row.customer_id) || "Desconocido";
                        const nFactura = row.factura_id ? facturasMap.get(row.factura_id) ? `#${facturasMap.get(row.factura_id)}` : "Factura" : "Manual";
                        const balance = row.monto_total - row.monto_pagado;
                        
                        return (
                          <tr key={row.id} className="border-t border-[rgba(72,72,71,0.12)] hover:bg-[#151515]">
                            <td className="px-4 py-3 font-semibold text-white">{custName}</td>
                            <td className="px-4 py-3 font-mono text-white text-[12px]">{nFactura}</td>
                            <td className="px-4 py-3 text-[#adaaaa]">{dateFormatter.format(new Date(row.fecha_emision))}</td>
                            <td className="px-4 py-3 text-[#adaaaa]">{dateFormatter.format(new Date(row.fecha_vencimiento))}</td>
                            <td className="px-4 py-3 text-right font-medium">{RD(row.monto_total)}</td>
                            <td className="px-4 py-3 text-right text-[#59ee50]">{RD(row.monto_pagado)}</td>
                            <td className="px-4 py-3 text-right text-[#ff716c] font-bold">{RD(balance)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold uppercase ${
                                row.estado === "pagada"
                                  ? "bg-[rgba(89,238,80,0.12)] text-[#59ee50]"
                                  : row.estado === "parcial"
                                  ? "bg-[rgba(255,144,109,0.12)] text-[#ff906d]"
                                  : "bg-[rgba(255,113,108,0.12)] text-[#ff716c]"
                              }`}>
                                {row.estado}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openDetailModal(row)}
                                  className="bg-[#222] border border-[rgba(72,72,71,0.4)] hover:border-white text-[#adaaaa] hover:text-white rounded-[8px] p-1.5 transition-all cursor-pointer"
                                  title="Ver detalle e historial"
                                >
                                  <Eye className="size-[14px]" />
                                </button>
                                {activeTab === 'pendientes' && (
                                  <button
                                    type="button"
                                    onClick={() => openAbonarModal(row)}
                                    className="bg-[#ff906d] rounded-[8px] px-3 py-1 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[10px] uppercase cursor-pointer border-none transition-transform hover:scale-[1.03]"
                                  >
                                    Cobrar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Historical Payments */}
          {activeTab === 'pagos' && (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                Historial de Cobros Realizados ({pagos.length})
              </span>

              {pagos.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No se registran transacciones de cobro todavía.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-[16px] border border-[rgba(72,72,71,0.18)] min-h-0 bg-[#111]">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
                      <tr className="text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.18)]">
                        <th className="px-4 py-3.5">Fecha y Hora</th>
                        <th className="px-4 py-3.5">Referencia Crédito</th>
                        <th className="px-4 py-3.5">Método de Pago</th>
                        <th className="px-4 py-3.5">Detalles / Notas</th>
                        <th className="px-4 py-3.5 text-right">Monto Recibido</th>
                      </tr>
                    </thead>
                    <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                      {pagos.map((row) => (
                        <tr key={row.id} className="border-t border-[rgba(72,72,71,0.12)] hover:bg-[#151515]">
                          <td className="px-4 py-3 text-[#adaaaa]">
                            {dateTimeFormatter.format(new Date(row.fecha_pago))}
                          </td>
                          <td className="px-4 py-3 font-mono text-[12px]">{row.cuenta_cobrar_id.slice(0, 8)}...</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-[5px] bg-[#222] border border-[rgba(72,72,71,0.3)] text-white text-[10px] font-bold uppercase">
                              {row.metodo_pago}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#adaaaa] italic">{row.notas || "Sin notas"}</td>
                          <td className="px-4 py-3 text-right font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50]">
                            {RD(row.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* REGISTRAR ABONO MODAL */}
      {selectedCuenta && (
        <RegistrarPagoCxCModal
          isOpen={showPayModal}
          onClose={() => {
            setShowPayModal(false);
            setSelectedCuenta(null);
          }}
          tenantId={tenantId}
          activeSucursalId={activeSucursalId}
          userId={user?.id || null}
          selectedCuenta={selectedCuenta}
          clienteNombre={customersMap.get(selectedCuenta.customer_id) || "Desconocido"}
          cicloAbierto={!!cicloAbierto}
          onSuccess={(msg) => {
            setSuccessMsg(msg);
            void cargarDatos();
          }}
          onError={(msg) => {
            setMessage(msg);
          }}
        />
      )}

      {/* DETALLE CUENTA MODAL */}
      {detailCuenta && (
        <DetalleCuentaCobrarModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setDetailCuenta(null);
          }}
          tenantId={tenantId}
          cuenta={detailCuenta}
          clienteNombre={customersMap.get(detailCuenta.customer_id) || "Desconocido"}
          facturaNumero={detailCuenta.factura_id ? facturasMap.get(detailCuenta.factura_id) ? `#${facturasMap.get(detailCuenta.factura_id)}` : "Factura" : "Manual"}
        />
      )}
    </div>
  );
}
