import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, DollarSign, FileText, CheckCircle, Clock } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useSucursal } from "../../../app/context/SucursalContext";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { insforgeClient } from "../../../shared/lib/insforge";
import { registrarPagoCxP } from "../lib/accountsPayableService";

interface ProveedorRow {
  id: string;
  nombre: string;
}

interface CompraRow {
  id: string;
  numero_factura: string | null;
}

interface CuentaPagarRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  compra_id: string | null;
  proveedor_id: string;
  monto_total: number;
  monto_pagado: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: "pendiente" | "parcial" | "pagada";
  observacion: string | null;
}

interface CxpPagoRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  cuenta_pagar_id: string;
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

export function CuentasPagar() {
  const { tenantId, user } = useAuth();
  const { activeSucursalId } = useSucursal();

  const [activeTab, setActiveTab] = useState<'pendientes' | 'pagadas' | 'pagos'>('pendientes');

  // Data state
  const [cuentas, setCuentas] = useState<CuentaPagarRow[]>([]);
  const [pagos, setPagos] = useState<CxpPagoRow[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [compras, setCompras] = useState<CompraRow[]>([]);
  const [cicloAbierto, setCicloAbierto] = useState<{ id: string; closed_at: string | null; opened_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Payment Modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaPagarRow | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    monto: "",
    metodoPago: "transferencia" as "efectivo" | "tarjeta" | "transferencia" | "digital",
    notas: "",
  });

  const cargarDatos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage("");
    try {
      const useLocal = await shouldReadLocalFirst(tenantId, [
        "cuentas_pagar",
        "cxp_pagos",
        "proveedores",
        "compras",
        "cierres_operativos",
      ]);

      let cuentasData: CuentaPagarRow[] = [];
      let pagosData: CxpPagoRow[] = [];
      let proveedoresData: ProveedorRow[] = [];
      let comprasData: CompraRow[] = [];
      let ciclosData: any[] = [];

      if (useLocal) {
        cuentasData = await readLocalMirror<CuentaPagarRow>(tenantId, "cuentas_pagar");
        pagosData = await readLocalMirror<CxpPagoRow>(tenantId, "cxp_pagos");
        proveedoresData = await readLocalMirror<ProveedorRow>(tenantId, "proveedores");
        comprasData = await readLocalMirror<CompraRow>(tenantId, "compras");
        ciclosData = await readLocalMirror<any>(tenantId, "cierres_operativos");
      } else {
        const [cRes, paRes, pRes, coRes, cyRes] = await Promise.all([
          insforgeClient.database.from("cuentas_pagar").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("cxp_pagos").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("proveedores").select("id, nombre").eq("tenant_id", tenantId),
          insforgeClient.database.from("compras").select("id, numero_factura").eq("tenant_id", tenantId),
          insforgeClient.database.from("cierres_operativos").select("id, cycle_number, opened_at, closed_at, sucursal_id").eq("tenant_id", tenantId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1),
        ]);
        cuentasData = cRes.data || [];
        pagosData = paRes.data || [];
        proveedoresData = pRes.data || [];
        comprasData = coRes.data || [];
        ciclosData = cyRes.data || [];
      }

      setCuentas(cuentasData);
      setPagos(pagosData.sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago)));
      setProveedores(proveedoresData);
      setCompras(comprasData);

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

  const proveedoresMap = useMemo(() => {
    return new Map(proveedores.map(p => [p.id, p.nombre]));
  }, [proveedores]);

  const comprasMap = useMemo(() => {
    return new Map(compras.map(c => [c.id, c.numero_factura]));
  }, [compras]);

  const stats = useMemo(() => {
    let totalDeuda = 0;
    let totalPagado = 0;
    let pendientesCount = 0;

    cuentas.forEach((c) => {
      const tot = Number(c.monto_total) || 0;
      const pag = Number(c.monto_pagado) || 0;
      if (c.estado !== "pagada") {
        totalDeuda += (tot - pag);
        pendientesCount++;
      }
      totalPagado += pag;
    });

    return { totalDeuda, totalPagado, pendientesCount };
  }, [cuentas]);

  const filteredCuentas = useMemo(() => {
    return cuentas.filter((c) => {
      if (activeTab === "pendientes") return c.estado !== "pagada";
      if (activeTab === "pagadas") return c.estado === "pagada";
      return false;
    }).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
  }, [cuentas, activeTab]);

  async function handleRegistrarAbono(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !selectedCuenta) return;
    const amountVal = Number(paymentForm.monto);
    if (amountVal <= 0) {
      setMessage("El monto debe ser mayor a cero.");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMsg("");

    try {
      await registrarPagoCxP({
        tenantId,
        sucursalId: activeSucursalId,
        usuarioId: user?.id || null,
        cuentaPagarId: selectedCuenta.id,
        monto: amountVal,
        metodoPago: paymentForm.metodoPago,
        notas: paymentForm.notas.trim(),
      });

      setSuccessMsg("Abono registrado correctamente.");
      setShowPayModal(false);
      setPaymentForm({ monto: "", metodoPago: "transferencia", notas: "" });
      setSelectedCuenta(null);
      await cargarDatos();
    } catch (err: any) {
      setMessage(err.message || "Error al registrar abono.");
    } finally {
      setSaving(false);
    }
  }

  function openAbonarModal(cuenta: CuentaPagarRow) {
    setSelectedCuenta(cuenta);
    const balance = Number((cuenta.monto_total - cuenta.monto_pagado).toFixed(2));
    setPaymentForm({
      monto: balance.toString(),
      metodoPago: "transferencia",
      notas: "",
    });
    setShowPayModal(true);
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 min-h-0 bg-[#0c0c0c] text-white">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-[rgba(72,72,71,0.15)] shrink-0">
        <div>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase tracking-[0.5px]">
            Finanzas y Egresos
          </span>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] uppercase tracking-[0.5px] mt-0.5">
            Cuentas por Pagar
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
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Deuda Pendiente</span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] mt-0.5">{RD(stats.totalDeuda)}</h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(89,238,80,0.1)] rounded-[10px] p-2.5 text-[#59ee50]">
            <CheckCircle className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Total Amortizado</span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] mt-0.5">{RD(stats.totalPagado)}</h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(255,144,109,0.1)] rounded-[10px] p-2.5 text-[#ff906d]">
            <FileText className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Cuentas Activas</span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] mt-0.5">{stats.pendientesCount} deudas</h4>
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
          Deudas Pendientes
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
          Deudas Pagadas
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
          Historial de Pagos
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
          <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando cuentas y deudas...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* TAB 1 & 2: Cuentas por Pagar List */}
          {activeTab !== 'pagos' && (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                {activeTab === 'pendientes' ? "Deudas Activas" : "Historial de Cuentas Saldadas"} ({filteredCuentas.length})
              </span>

              {filteredCuentas.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No se registran deudas en esta categoría.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-[16px] border border-[rgba(72,72,71,0.18)] min-h-0 bg-[#111]">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
                      <tr className="text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.18)]">
                        <th className="px-4 py-3.5">Proveedor</th>
                        <th className="px-4 py-3.5">Factura / Compra</th>
                        <th className="px-4 py-3.5">Emisión</th>
                        <th className="px-4 py-3.5">Vencimiento</th>
                        <th className="px-4 py-3.5 text-right">Total Deuda</th>
                        <th className="px-4 py-3.5 text-right">Pagado</th>
                        <th className="px-4 py-3.5 text-right">Pendiente</th>
                        <th className="px-4 py-3.5 text-center">Estado</th>
                        {activeTab === 'pendientes' && <th className="px-4 py-3.5 text-center">Acción</th>}
                      </tr>
                    </thead>
                    <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                      {filteredCuentas.map((row) => {
                        const provName = proveedoresMap.get(row.proveedor_id) || "Desconocido";
                        const nFactura = row.compra_id ? comprasMap.get(row.compra_id) || "Factura" : "Manual";
                        const balance = row.monto_total - row.monto_pagado;
                        
                        return (
                          <tr key={row.id} className="border-t border-[rgba(72,72,71,0.12)] hover:bg-[#151515]">
                            <td className="px-4 py-3 font-semibold text-white">{provName}</td>
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
                            {activeTab === 'pendientes' && (
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => openAbonarModal(row)}
                                  className="bg-[#ff906d] rounded-[8px] px-3 py-1 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[10px] uppercase cursor-pointer border-none transition-transform hover:scale-[1.03]"
                                >
                                  Abonar
                                </button>
                              </td>
                            )}
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
                Historial de Egresos Realizados ({pagos.length})
              </span>

              {pagos.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No se registran transacciones de pago todavía.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-[16px] border border-[rgba(72,72,71,0.18)] min-h-0 bg-[#111]">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
                      <tr className="text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.18)]">
                        <th className="px-4 py-3.5">Fecha y Hora</th>
                        <th className="px-4 py-3.5">Referencia Deuda</th>
                        <th className="px-4 py-3.5">Método de Pago</th>
                        <th className="px-4 py-3.5">Detalles / Notas</th>
                        <th className="px-4 py-3.5 text-right">Monto Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                      {pagos.map((row) => (
                        <tr key={row.id} className="border-t border-[rgba(72,72,71,0.12)] hover:bg-[#151515]">
                          <td className="px-4 py-3 text-[#adaaaa]">
                            {dateTimeFormatter.format(new Date(row.fecha_pago))}
                          </td>
                          <td className="px-4 py-3 font-mono text-[12px]">{row.cuenta_pagar_id.slice(0, 8)}...</td>
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
      {showPayModal && selectedCuenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[440px] w-full p-6 relative">
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4">
              Registrar Abono a Proveedor
            </h3>
            
            <div className="bg-[#171717] border border-[rgba(72,72,71,0.18)] rounded-[12px] p-3 mb-4 font-['Inter',sans-serif] text-[13px] text-white">
              <div className="flex justify-between">
                <span className="text-[#adaaaa]">Proveedor:</span>
                <span className="font-bold">{proveedoresMap.get(selectedCuenta.proveedor_id) || "Desconocido"}</span>
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[#adaaaa]">Total Deuda:</span>
                <span>{RD(selectedCuenta.monto_total)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[#adaaaa]">Saldo Pendiente:</span>
                <span className="text-[#ff716c] font-bold">{RD(selectedCuenta.monto_total - selectedCuenta.monto_pagado)}</span>
              </div>
            </div>

            <form onSubmit={handleRegistrarAbono} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Monto del Abono *</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  max={Number((selectedCuenta.monto_total - selectedCuenta.monto_pagado).toFixed(2))}
                  value={paymentForm.monto}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, monto: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Método de Pago *</label>
                <select
                  required
                  value={paymentForm.metodoPago}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, metodoPago: e.target.value as any }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
                >
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="efectivo">Efectivo (Salida de Caja)</option>
                  <option value="tarjeta">Tarjeta de crédito</option>
                  <option value="digital">Pago digital / Otro</option>
                </select>
              </div>

              {paymentForm.metodoPago === "efectivo" && !cicloAbierto && (
                <div className="bg-[rgba(255,113,108,0.08)] border border-[rgba(255,113,108,0.25)] rounded-[10px] p-3 text-[12px] text-[#ff716c] font-['Inter',sans-serif]">
                  ⚠️ <strong>Caja Cerrada:</strong> No hay un ciclo operativo abierto. Debes abrir uno en la sección de Cierre para poder registrar egresos en efectivo.
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Notas / Comentarios</label>
                <textarea
                  placeholder="Ej: Transferencia del Banco Popular, recibo #12345"
                  value={paymentForm.notas}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notas: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2 font-['Inter',sans-serif] text-white text-[13px] outline-none h-[60px] resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="bg-[#262626] text-[#adaaaa] rounded-[10px] px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || (paymentForm.metodoPago === "efectivo" && !cicloAbierto)}
                  className="bg-[#ff906d] rounded-[10px] px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none disabled:opacity-50"
                >
                  {saving ? "Registrando..." : "Guardar Pago"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
