import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, FileText, Users, Edit, Trash2 } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useSucursal } from "../../../app/context/SucursalContext";
import { readLocalMirror, enqueueLocalWrite, getDeviceId, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { insforgeClient } from "../../../shared/lib/insforge";
import { registrarCompra } from "../lib/purchaseService";

interface ProveedorRow {
  id: string;
  tenant_id: string;
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

interface CompraRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  proveedor_id: string | null;
  numero_factura: string | null;
  tipo_pago: "contado" | "credito";
  fecha_compra: string;
  total: number;
  estado: string;
  observacion: string | null;
}

interface ProductoRow {
  id: string;
  nombre: string;
  unidad_base: string;
  ml_por_botella: number | null;
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modals
  const [showCompraModal, setShowCompraModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<ProveedorRow | null>(null);

  // Supplier Form state
  const [proveedorForm, setProveedorForm] = useState({
    nombre: "",
    rnc: "",
    telefono: "",
    email: "",
    direccion: "",
  });

  // Purchase Form state
  const [compraForm, setCompraForm] = useState({
    proveedor_id: "",
    tipo_pago: "contado" as "contado" | "credito" | "parcial",
    metodo_pago: "efectivo" as "efectivo" | "tarjeta" | "transferencia" | "digital" | "",
    monto_pagado: "",
    numero_factura: "",
    observacion: "",
  });
  
  const [purchaseItems, setPurchaseItems] = useState<{
    producto_id: string;
    cantidad: string;
    costo_unitario: string;
  }[]>([]);

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



  // CRUD Proveedor Action
  async function guardarProveedor(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const nombre = proveedorForm.nombre.trim();
    if (!nombre) return;

    setSaving(true);
    setMessage("");
    setSuccessMsg("");

    try {
      const isEditing = !!editingProveedor;
      const id = isEditing ? editingProveedor.id : crypto.randomUUID();
      const payload: ProveedorRow = {
        id,
        tenant_id: tenantId,
        nombre,
        rnc: proveedorForm.rnc.trim() || null,
        telefono: proveedorForm.telefono.trim() || null,
        email: proveedorForm.email.trim() || null,
        direccion: proveedorForm.direccion.trim() || null,
        activo: true,
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "proveedores",
        rowId: id,
        op: isEditing ? "update" : "insert",
        payload: payload as unknown as Record<string, unknown>,
        deviceId: await getDeviceId(),
      });

      setSuccessMsg(isEditing ? "Proveedor actualizado correctamente." : "Proveedor creado correctamente.");
      setProveedorForm({ nombre: "", rnc: "", telefono: "", email: "", direccion: "" });
      setEditingProveedor(null);
      setShowProveedorModal(false);
      await cargarDatos();
    } catch (err: any) {
      setMessage(err.message || "Error al guardar proveedor");
    } finally {
      setSaving(false);
    }
  }

  function handleEditProveedor(prov: ProveedorRow) {
    setEditingProveedor(prov);
    setProveedorForm({
      nombre: prov.nombre,
      rnc: prov.rnc || "",
      telefono: prov.telefono || "",
      email: prov.email || "",
      direccion: prov.direccion || "",
    });
    setShowProveedorModal(true);
  }

  // Register Purchase Action
  async function handleRegistrarCompra(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    if (!compraForm.proveedor_id) {
      setMessage("Debes seleccionar un proveedor antes de registrar una compra.");
      return;
    }
    if (purchaseItems.length === 0) {
      setMessage("Debes agregar al menos un insumo a la compra.");
      return;
    }

    // Validate items
    const itemsPayload = purchaseItems.map(item => {
      const cant = Number(item.producto_id ? item.cantidad : 0);
      const cost = Number(item.producto_id ? item.costo_unitario : 0);
      if (!item.producto_id || cant <= 0 || cost <= 0) {
        throw new Error("La cantidad y costo unitario de cada producto deben ser mayores a cero.");
      }
      return {
        producto_id: item.producto_id,
        cantidad: cant,
        costo_unitario: cost,
      };
    });

    // Validations for payment type
    const isContado = compraForm.tipo_pago === "contado";
    const isParcial = compraForm.tipo_pago === "parcial";
    
    if ((isContado || isParcial) && !compraForm.metodo_pago) {
      setMessage("Selecciona un método de pago.");
      return;
    }

    let resolvedMontoPagado: number | undefined;
    if (isParcial) {
      const pAmount = Number(compraForm.monto_pagado);
      if (isNaN(pAmount) || pAmount <= 0) {
        setMessage("El abono no puede ser menor o igual a cero.");
        return;
      }
      if (pAmount >= runningTotal) {
        setMessage("El abono no puede ser mayor o igual al total de la deuda.");
        return;
      }
      resolvedMontoPagado = pAmount;
    }

    setSaving(true);
    setMessage("");
    setSuccessMsg("");

    try {
      await registrarCompra({
        tenantId,
        sucursalId: activeSucursalId,
        usuarioId: user?.id || null,
        proveedorId: compraForm.proveedor_id,
        numeroFactura: compraForm.numero_factura.trim(),
        tipoPago: compraForm.tipo_pago,
        metodoPago: (isContado || isParcial) ? (compraForm.metodo_pago as any) : null,
        montoPagado: resolvedMontoPagado,
        items: itemsPayload,
        observacion: compraForm.observacion.trim(),
      });

      setSuccessMsg("Compra registrada y stock actualizado correctamente.");
      setCompraForm({ proveedor_id: "", tipo_pago: "contado", metodo_pago: "efectivo", monto_pagado: "", numero_factura: "", observacion: "" });
      setPurchaseItems([]);
      setShowCompraModal(false);
      await cargarDatos();
    } catch (err: any) {
      setMessage(err.message || "Error al registrar la compra.");
    } finally {
      setSaving(false);
    }
  }

  // Helpers for items table in form
  function addRow() {
    setPurchaseItems(prev => [...prev, { producto_id: "", cantidad: "", costo_unitario: "" }]);
  }

  function removeRow(idx: number) {
    setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: string, value: string) {
    setPurchaseItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  }

  const runningTotal = useMemo(() => {
    return purchaseItems.reduce((acc, item) => {
      const q = Number(item.cantidad) || 0;
      const c = Number(item.costo_unitario) || 0;
      return acc + (q * c);
    }, 0);
  }, [purchaseItems]);

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
        <button
          type="button"
          onClick={() => void cargarDatos()}
          className="bg-transparent border border-[rgba(72,72,71,0.3)] hover:border-white text-[#adaaaa] hover:text-white rounded-[10px] p-2.5 transition-colors cursor-pointer"
          title="Refrescar datos"
        >
          <RefreshCw className="size-[16px]" />
        </button>
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
                  onClick={() => {
                    setPurchaseItems([{ producto_id: "", cantidad: "", costo_unitario: "" }]);
                    setShowCompraModal(true);
                  }}
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
                    setProveedorForm({ nombre: "", rnc: "", telefono: "", email: "", direccion: "" });
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
      {showCompraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[700px] w-full p-6 relative flex flex-col max-h-[90vh]">
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4 shrink-0">
              Registrar Factura de Compra
            </h3>

            <form onSubmit={handleRegistrarCompra} className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Proveedor *</label>
                  <select
                    required
                    value={compraForm.proveedor_id}
                    onChange={(e) => setCompraForm(prev => ({ ...prev, proveedor_id: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none"
                  >
                    <option value="">Selecciona proveedor</option>
                    {proveedores.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} ({p.rnc || "S/RNC"})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Tipo de Pago *</label>
                  <select
                    value={compraForm.tipo_pago}
                    onChange={(e) => setCompraForm(prev => ({ ...prev, tipo_pago: e.target.value as any, metodo_pago: e.target.value === "credito" ? "" : "efectivo", monto_pagado: "" }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none"
                  >
                    <option value="contado">Contado</option>
                    <option value="parcial">Pago Parcial / Crédito</option>
                    <option value="credito">Crédito Puro</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Número Factura</label>
                  <input
                    type="text"
                    placeholder="Ej: B150004523"
                    value={compraForm.numero_factura}
                    onChange={(e) => setCompraForm(prev => ({ ...prev, numero_factura: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                  />
                </div>
              </div>

              {/* Conditional payment details (method and initial pay) */}
              {(compraForm.tipo_pago === "contado" || compraForm.tipo_pago === "parcial") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0 border border-zinc-800 bg-zinc-950/20 p-3 rounded-[12px] text-left">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Método de Pago *</label>
                    <select
                      required
                      value={compraForm.metodo_pago}
                      onChange={(e) => setCompraForm(prev => ({ ...prev, metodo_pago: e.target.value as any }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none focus:border-[#ff906d]/50"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="digital">Digital</option>
                    </select>
                  </div>
                  {compraForm.tipo_pago === "parcial" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Monto Inicial Pagado (RD$) *</label>
                      <input
                        type="number"
                        required
                        step="any"
                        min="0.01"
                        placeholder="Ej: 5000"
                        value={compraForm.monto_pagado}
                        onChange={(e) => setCompraForm(prev => ({ ...prev, monto_pagado: e.target.value }))}
                        className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[12.5px] outline-none focus:border-[#ff906d]/50"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {(compraForm.tipo_pago === "contado" || compraForm.tipo_pago === "parcial") && !cicloAbierto && (
                <div className="bg-[rgba(255,113,108,0.08)] border border-[rgba(255,113,108,0.25)] rounded-[10px] p-3 text-[12px] text-[#ff716c] font-['Inter',sans-serif] shrink-0 text-left">
                  ⚠️ <strong>Caja Cerrada:</strong> No hay un ciclo operativo abierto. Debes abrir uno en la sección de Cierre antes de registrar compras con cobro inmediato.
                </div>
              )}

              {/* Items Section */}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="flex justify-between items-center">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] uppercase">
                    Insumos Comprados
                  </span>
                  <button
                    type="button"
                    onClick={addRow}
                    className="bg-[#262626] border border-[rgba(255,144,109,0.25)] text-[#ff906d] rounded-[6px] px-2.5 py-1 text-[10.5px] font-bold uppercase cursor-pointer"
                  >
                    + Agregar Fila
                  </button>
                </div>

                <div className="overflow-auto border border-[rgba(72,72,71,0.18)] rounded-[10px] min-h-[150px] bg-[#101010]">
                  <table className="w-full border-collapse">
                    <thead className="bg-[#181818]">
                      <tr className="text-left font-['Inter',sans-serif] text-[9px] uppercase tracking-[0.5px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.18)]">
                        <th className="px-3 py-2">Insumo / Materia Prima</th>
                        <th className="px-3 py-2 w-[110px]">Cantidad</th>
                        <th className="px-3 py-2 w-[140px]">Costo Unit. (RD$)</th>
                        <th className="px-3 py-2 w-[45px]"></th>
                      </tr>
                    </thead>
                    <tbody className="font-['Inter',sans-serif] text-[12px] text-white">
                      {purchaseItems.map((item, idx) => {
                        const selectedProd = productos.find(p => p.id === item.producto_id);
                        const isLiquid = selectedProd?.ml_por_botella && selectedProd.ml_por_botella > 0;
                        return (
                          <tr key={idx} className="border-t border-[rgba(72,72,71,0.1)]">
                            <td className="px-2.5 py-2 text-left">
                              <select
                                required
                                value={item.producto_id}
                                onChange={(e) => updateRow(idx, "producto_id", e.target.value)}
                                className="w-full bg-[#151515] border border-[rgba(72,72,71,0.3)] rounded-[6px] px-2 py-1.5 text-white outline-none"
                              >
                                <option value="">Selecciona insumo</option>
                                {productos.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre} {p.ml_por_botella ? `(Bot. ${p.ml_por_botella} ml)` : `(${p.unidad_base})`}
                                  </option>
                                ))}
                              </select>
                              {selectedProd && isLiquid && item.cantidad && Number(item.cantidad) > 0 && (
                                <span className="text-[10px] text-[#ff906d] block mt-1 px-1">
                                  Equivale a {(Number(item.cantidad) * (selectedProd.ml_por_botella || 0)).toLocaleString()} ml de stock base
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                required
                                step="any"
                                min="0.01"
                                placeholder={isLiquid ? "Botellas" : (selectedProd?.unidad_base || "Cantidad")}
                                value={item.cantidad}
                                onChange={(e) => updateRow(idx, "cantidad", e.target.value)}
                                className="w-full bg-[#151515] border border-[rgba(72,72,71,0.3)] rounded-[6px] px-2 py-1.5 text-white outline-none"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                required
                                step="any"
                                min="0"
                                placeholder={isLiquid ? "Costo Botella" : "Costo Unit."}
                                value={item.costo_unitario}
                                onChange={(e) => updateRow(idx, "costo_unitario", e.target.value)}
                                className="w-full bg-[#151515] border border-[rgba(72,72,71,0.3)] rounded-[6px] px-2 py-1.5 text-white outline-none"
                              />
                            </td>
                            <td className="px-2.5 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                className="bg-transparent border-none text-[#ff716c] hover:text-[#ff3831] cursor-pointer"
                                title="Remover"
                              >
                                <Trash2 className="size-[14px]" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {purchaseItems.some(i => i.producto_id) && (
                  <div className="bg-[#181818] border border-zinc-800 rounded-xl p-3 text-[11px] text-[#adaaaa] font-['Inter',sans-serif] shrink-0 mt-1.5 text-left">
                    <span className="font-bold text-white uppercase block mb-1">Resumen de Incremento de Inventario</span>
                    <ul className="list-disc pl-4 flex flex-col gap-1">
                      {purchaseItems.map((item, idx) => {
                        const prod = productos.find(p => p.id === item.producto_id);
                        const q = Number(item.cantidad) || 0;
                        if (!prod || q <= 0) return null;
                        const isLiquid = prod.ml_por_botella && prod.ml_por_botella > 0;
                        const addedBase = isLiquid ? (q * (prod.ml_por_botella || 0)) : q;
                        return (
                          <li key={idx}>
                            <b>{prod.nombre}:</b> +{q.toLocaleString()} {isLiquid ? `botellas (${addedBase.toLocaleString()} ml)` : `${prod.unidad_base}`} agregados al stock.
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {/* Extra notes */}
              <div className="flex flex-col gap-1.5 shrink-0 text-left">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Observaciones</label>
                <textarea
                  placeholder="Detalles extra de la compra, condiciones de recepción, etc."
                  value={compraForm.observacion}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, observacion: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none h-[60px] resize-none"
                />
              </div>

              {/* Summary and Buttons */}
              <div className="flex justify-between items-center pt-3 border-t border-[rgba(72,72,71,0.15)] mt-1 shrink-0">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Monto Total Factura:</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px]">
                    {RD(runningTotal)}
                  </span>
                  {compraForm.tipo_pago === "parcial" && compraForm.monto_pagado && (
                    <span className="text-[11px] text-[#ff906d]">
                      Paga hoy: {RD(Number(compraForm.monto_pagado) || 0)} · Pendiente: {RD(Math.max(0, runningTotal - (Number(compraForm.monto_pagado) || 0)))}
                    </span>
                  )}
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCompraModal(false)}
                    className="bg-[#262626] text-[#adaaaa] rounded-[8px] px-4 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[10.5px] uppercase cursor-pointer border-none"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || ((compraForm.tipo_pago === "contado" || compraForm.tipo_pago === "parcial") && !cicloAbierto)}
                    className="bg-[#ff906d] rounded-[8px] px-4 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[10.5px] uppercase cursor-pointer border-none disabled:opacity-50"
                  >
                    {saving ? "Registrando..." : "Guardar Compra"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROVEEDOR MODAL */}
      {showProveedorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[440px] w-full p-6 relative">
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4">
              {editingProveedor ? "Editar Proveedor" : "Agregar Proveedor"}
            </h3>

            <form onSubmit={guardarProveedor} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Brugal & Co. / Distribuidora Almonte"
                  value={proveedorForm.nombre}
                  onChange={(e) => setProveedorForm(prev => ({ ...prev, nombre: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">RNC / Cédula</label>
                  <input
                    type="text"
                    placeholder="Ej: 130-12345-6"
                    value={proveedorForm.rnc}
                    onChange={(e) => setProveedorForm(prev => ({ ...prev, rnc: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: 809-555-0199"
                    value={proveedorForm.telefono}
                    onChange={(e) => setProveedorForm(prev => ({ ...prev, telefono: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Email de contacto</label>
                <input
                  type="email"
                  placeholder="Ej: ventas@distribuidora.com"
                  value={proveedorForm.email}
                  onChange={(e) => setProveedorForm(prev => ({ ...prev, email: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Dirección física</label>
                <textarea
                  placeholder="Ej: Av. Winston Churchill #15, Santo Domingo"
                  value={proveedorForm.direccion}
                  onChange={(e) => setProveedorForm(prev => ({ ...prev, direccion: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2 font-['Inter',sans-serif] text-white text-[13px] outline-none h-[60px] resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setShowProveedorModal(false)}
                  className="bg-[#262626] text-[#adaaaa] rounded-[10px] px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#ff906d] rounded-[10px] px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar Proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
