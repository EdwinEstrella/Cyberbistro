import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, FileText, Users, Edit, Eye, Download } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { RegistrarCompraModal } from "./RegistrarCompraModal";
import { ProveedorModal } from "./ProveedorModal";
import { DetalleCompraModal } from "./DetalleCompraModal";
import { useSucursal } from "../../../app/context/SucursalContext";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { insforgeClient } from "../../../shared/lib/insforge";
import { generateFormato606, type CompraFiscal606 } from "../../contabilidad/lib/formato606";

export interface ProveedorRow {
  id: string;
  tenant_id: string;
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface CompraRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  proveedor_id: string | null;
  numero_factura: string | null;
  tipo_pago: "contado" | "credito" | string;
  metodo_pago?: string | null;
  monto_pagado?: number;
  fecha_compra: string;
  total: number;
  estado: string;
  observacion: string | null;
}

export interface ProductoRow {
  id: string;
  nombre: string;
  unidad_base: string;
  unidad_compra: string | null;
  contenido_por_unidad_compra: number | null;
  mostrar_en_fracciones: boolean;
  activo: boolean;
}

const RD = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function Compras() {
  const { tenantId, user } = useAuth();
  const { activeSucursalId } = useSucursal();

  const [activeTab, setActiveTab] = useState<'compras' | 'proveedores'>('compras');
  
  // Data state
  const [compras, setCompras] = useState<CompraRow[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [cicloAbierto, setCicloAbierto] = useState<{ id: string; closed_at: string | null; opened_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [period606, setPeriod606] = useState(() => new Date().toISOString().slice(0, 7));
  const [periodMode606, setPeriodMode606] = useState<"month" | "range">("month");
  const [from606, setFrom606] = useState(() => `${new Date().toISOString().slice(0, 7)}-01`);
  const [to606, setTo606] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting606, setExporting606] = useState(false);

  // Modals
  const [showCompraModal, setShowCompraModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<ProveedorRow | null>(null);
  const [selectedCompraForDetail, setSelectedCompraForDetail] = useState<CompraRow | null>(null);



  // Load Data
  const cargarDatos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage("");
    try {
      const useLocal = await shouldReadLocalFirst(tenantId, ["compras", "proveedores", "productos_inventario", "cierres_operativos"]);
      
      let comprasData: CompraRow[] = [];
      let proveedoresData: ProveedorRow[] = [];
      let productosData: ProductoRow[] = [];
      let ciclosData: any[] = [];

      if (useLocal) {
        comprasData = await readLocalMirror<CompraRow>(tenantId, "compras");
        proveedoresData = await readLocalMirror<ProveedorRow>(tenantId, "proveedores");
        productosData = await readLocalMirror<ProductoRow>(tenantId, "productos_inventario");
        ciclosData = await readLocalMirror<any>(tenantId, "cierres_operativos");
      } else {
        const [cRes, pRes, iRes, cyRes] = await Promise.all([
          insforgeClient.database.from("compras").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("proveedores").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("productos_inventario").select("*").eq("tenant_id", tenantId),
          insforgeClient.database.from("cierres_operativos").select("id, cycle_number, opened_at, closed_at, sucursal_id").eq("tenant_id", tenantId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1),
        ]);
        comprasData = cRes.data || [];
        proveedoresData = pRes.data || [];
        productosData = iRes.data || [];
        ciclosData = cyRes.data || [];
      }

      // Filter and Sort
      setCompras(comprasData.sort((a, b) => b.fecha_compra.localeCompare(a.fecha_compra)));
      setProveedores(proveedoresData.filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setProductos(productosData.filter(i => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)));

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
    return new Map(proveedores.map(p => [p.id, p]));
  }, [proveedores]);

  const monthOptions606 = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric" });
    const now = new Date();
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { value, label: formatter.format(date) };
    });
  }, []);



  function handleEditProveedor(prov: ProveedorRow) {
    setEditingProveedor(prov);
    setShowProveedorModal(true);
  }

  async function exportFormato606() {
    if (!tenantId) return;
    setExporting606(true);
    setMessage("");
    try {
      const selectedPeriod = periodMode606 === "month" ? period606 : from606.slice(0, 7);
      if (periodMode606 === "range" && (from606.slice(0, 7) !== to606.slice(0, 7) || from606 > to606)) {
        throw new Error("El Formato 606 se presenta por mes. Elegí fechas dentro del mismo mes.");
      }
      const [year, month] = selectedPeriod.split("-");
      if (!year || !month) throw new Error("Seleccioná un período válido.");
      const start = periodMode606 === "range" ? from606 : `${year}-${month}-01`;
      const end = periodMode606 === "range"
        ? new Date(`${to606}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000
        : new Date(Number(year), Number(month), 1).getTime();
      const endDate = new Date(end).toISOString().slice(0, 10);
      const [tenantResult, fiscalResult] = await Promise.all([
        insforgeClient.database.from("tenants").select("rnc").eq("id", tenantId).maybeSingle(),
        insforgeClient.database.from("compra_fiscal").select("*").eq("tenant_id", tenantId).gte("fecha_comprobante", start).lt("fecha_comprobante", endDate).order("fecha_comprobante", { ascending: true }),
      ]);
      if (tenantResult.error) throw tenantResult.error;
      if (fiscalResult.error) throw fiscalResult.error;
      const emitterRnc = tenantResult.data?.rnc?.replace(/\D/g, "") || "";
      if (!/^[0-9]{9,11}$/.test(emitterRnc)) {
        throw new Error("Configurá el RNC o cédula del emisor en Ajustes antes de exportar el Formato 606.");
      }
      const text = generateFormato606(emitterRnc, `${year}${month}`, (fiscalResult.data || []) as CompraFiscal606[]);
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `DGII-606-${year}${month}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setSuccessMsg(`Formato 606 generado con ${(fiscalResult.data || []).length} compra(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el Formato 606.");
    } finally {
      setExporting606(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 min-h-0 bg-[#0c0c0c] text-white">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-[rgba(72,72,71,0.15)] shrink-0">
        <div>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase tracking-[0.5px]">
            Inventario y Abastecimiento
          </span>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] uppercase tracking-[0.5px] mt-0.5">
            Módulo de Compras
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-[10px] border border-[rgba(72,72,71,0.3)] bg-[#111] p-1">
            <button type="button" onClick={() => setPeriodMode606("month")} className={`rounded-[7px] px-2.5 py-1.5 text-[10px] font-bold uppercase ${periodMode606 === "month" ? "bg-[#ff906d] text-[#460f00]" : "text-[#adaaaa]"}`}>Mes</button>
            <button type="button" onClick={() => setPeriodMode606("range")} className={`rounded-[7px] px-2.5 py-1.5 text-[10px] font-bold uppercase ${periodMode606 === "range" ? "bg-[#ff906d] text-[#460f00]" : "text-[#adaaaa]"}`}>Desde/Hasta</button>
          </div>
          {periodMode606 === "month" ? (
            <label className="flex items-center gap-2 rounded-[10px] border border-[rgba(72,72,71,0.3)] bg-[#111] px-2.5 py-2">
              <span className="text-[9px] font-bold uppercase tracking-wide text-[#6b7280]">Seleccionar mes</span>
              <select value={period606} onChange={(event) => setPeriod606(event.target.value)} className="bg-transparent text-xs font-semibold capitalize text-white outline-none" aria-label="Seleccionar mes para Formato 606">
                {monthOptions606.map((option) => <option key={option.value} value={option.value} className="bg-[#111]">{option.label}</option>)}
              </select>
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(72,72,71,0.3)] bg-[#111] px-2.5 py-2 text-xs">
              <label className="text-[#6b7280]">Desde <input type="date" value={from606} onChange={(event) => setFrom606(event.target.value)} className="ml-1 bg-transparent text-white outline-none" /></label>
              <label className="text-[#6b7280]">Hasta <input type="date" value={to606} onChange={(event) => setTo606(event.target.value)} className="ml-1 bg-transparent text-white outline-none" /></label>
            </div>
          )}
          <button type="button" onClick={() => void exportFormato606()} disabled={exporting606} className="flex items-center gap-1.5 rounded-[10px] border border-[#ff906d]/50 px-3 py-2 text-[11px] font-bold uppercase text-[#ff906d] disabled:opacity-50">
            <Download className="size-4" /> {exporting606 ? "Generando" : "Exportar 606"}
          </button>
          <button
            type="button"
            onClick={() => void cargarDatos()}
            className="bg-transparent border border-[rgba(72,72,71,0.3)] hover:border-white text-[#adaaaa] hover:text-white rounded-[10px] p-2.5 transition-colors cursor-pointer"
            title="Refrescar datos"
          >
            <RefreshCw className="size-[16px]" />
          </button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-2.5 shrink-0">
        <button
          onClick={() => setActiveTab('compras')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === 'compras'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <FileText className="size-[15px]" />
          Facturas de Compra
        </button>
        <button
          onClick={() => setActiveTab('proveedores')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === 'proveedores'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <Users className="size-[15px]" />
          Proveedores
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
          <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando compras y proveedores...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* TAB 1: Maestro Compras */}
          {activeTab === 'compras' && (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <div className="flex justify-between items-center shrink-0">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                  Registro de Facturas ({compras.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowCompraModal(true)}
                  className="bg-[#ff906d] rounded-[10px] px-3.5 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none flex items-center gap-1.5 transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Plus className="size-[14px]" strokeWidth={3} /> Registrar Compra
                </button>
              </div>

              {compras.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No se registran compras todavía en este restaurante.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-[16px] border border-[rgba(72,72,71,0.18)] min-h-0 bg-[#111]">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
                      <tr className="text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.18)]">
                        <th className="px-4 py-3.5">Fecha</th>
                        <th className="px-4 py-3.5">Factura</th>
                        <th className="px-4 py-3.5">Proveedor</th>
                        <th className="px-4 py-3.5">Tipo Pago</th>
                        <th className="px-4 py-3.5 text-right">Monto Total</th>
                        <th className="px-4 py-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                      {compras.map((row) => {
                        const prov = proveedoresMap.get(row.proveedor_id || "");
                        return (
                          <tr key={row.id} className="border-t border-[rgba(72,72,71,0.12)] hover:bg-[#151515]">
                            <td className="px-4 py-3 text-[#adaaaa]">
                              {dateFormatter.format(new Date(row.fecha_compra))}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-white">
                              {row.numero_factura || "S/N"}
                            </td>
                            <td className="px-4 py-3">{prov?.nombre || "Proveedor Desconocido"}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-[5px] text-[10px] font-bold uppercase ${
                                row.tipo_pago === "contado"
                                  ? "bg-[rgba(89,238,80,0.12)] text-[#59ee50]"
                                  : "bg-[rgba(255,144,109,0.12)] text-[#ff906d]"
                              }`}>
                                {row.tipo_pago}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-['Space_Grotesk',sans-serif] font-bold text-white">
                              {RD(row.total)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedCompraForDetail(row)}
                                className="bg-transparent border-none text-[#adaaaa] hover:text-[#ff906d] cursor-pointer p-1 transition-colors"
                                title="Ver Detalles"
                              >
                                <Eye className="size-[15px]" />
                              </button>
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

          {/* TAB 2: Maestro Proveedores */}
          {activeTab === 'proveedores' && (
            <div className="flex flex-col gap-4 flex-1">
              <div className="flex justify-between items-center">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                  Fichas de Proveedores ({proveedores.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProveedor(null);
                    setShowProveedorModal(true);
                  }}
                  className="bg-[#ff906d] rounded-[10px] px-3.5 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none flex items-center gap-1.5 transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Plus className="size-[14px]" strokeWidth={3} /> Nuevo Proveedor
                </button>
              </div>

              {proveedores.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No tenés proveedores registrados en el catálogo.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {proveedores.map((prov) => (
                    <div
                      key={prov.id}
                      className="bg-[#131313] border border-[rgba(72,72,71,0.18)] hover:border-[rgba(255,144,109,0.22)] rounded-[16px] p-4 flex flex-col gap-3 relative transition-all duration-300 group"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-['Inter',sans-serif] text-[9px] text-[#6b7280] uppercase tracking-[0.5px]">
                            RNC: {prov.rnc || "S/RNC"}
                          </span>
                          <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] mt-0.5 group-hover:text-[#ff906d] transition-colors">
                            {prov.nombre}
                          </h4>
                        </div>
                        <button
                          onClick={() => handleEditProveedor(prov)}
                          className="bg-transparent border-none text-[#adaaaa] hover:text-[#ff906d] cursor-pointer p-1 transition-colors"
                          title="Editar Proveedor"
                        >
                          <Edit className="size-[14px]" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1 text-[11.5px] font-['Inter',sans-serif] text-[#adaaaa] border-t border-[rgba(72,72,71,0.1)] pt-2.5">
                        {prov.telefono && (
                          <div className="flex justify-between">
                            <span>Teléfono:</span>
                            <span className="text-white font-medium">{prov.telefono}</span>
                          </div>
                        )}
                        {prov.email && (
                          <div className="flex justify-between">
                            <span>Email:</span>
                            <span className="text-white font-medium truncate max-w-[150px]" title={prov.email}>{prov.email}</span>
                          </div>
                        )}
                        {prov.direccion && (
                          <div className="text-[11px] text-[#8e8d8d] italic leading-tight mt-1">
                            {prov.direccion}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* REGISTRAR COMPRA MODAL */}
      <RegistrarCompraModal
        isOpen={showCompraModal}
        onClose={() => setShowCompraModal(false)}
        tenantId={tenantId}
        activeSucursalId={activeSucursalId}
        userId={user?.id || null}
        proveedores={proveedores}
        productos={productos}
        cicloAbierto={!!cicloAbierto}
        onSuccess={(msg) => {
          setSuccessMsg(msg);
          void cargarDatos();
        }}
        onError={(msg) => {
          setMessage(msg);
        }}
      />

      {/* PROVEEDOR MODAL */}
      <ProveedorModal
        isOpen={showProveedorModal}
        onClose={() => {
          setShowProveedorModal(false);
          setEditingProveedor(null);
        }}
        tenantId={tenantId}
        editingProveedor={editingProveedor}
        onSuccess={(msg) => {
          setSuccessMsg(msg);
          void cargarDatos();
        }}
        onError={(msg) => {
          setMessage(msg);
        }}
      />

      {/* DETALLE COMPRA MODAL */}
      <DetalleCompraModal
        isOpen={selectedCompraForDetail !== null}
        onClose={() => setSelectedCompraForDetail(null)}
        tenantId={tenantId}
        compra={selectedCompraForDetail}
        proveedor={selectedCompraForDetail ? proveedoresMap.get(selectedCompraForDetail.proveedor_id || "") || null : null}
        productos={productos}
      />
    </div>
  );
}
