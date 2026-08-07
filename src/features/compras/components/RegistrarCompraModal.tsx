import { FormEvent, useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { registrarCompra } from "../lib/purchaseService";

const RD = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ProveedorRow {
  id: string;
  nombre: string;
  rnc: string | null;
}

interface ProductoRow {
  id: string;
  nombre: string;
  unidad_base: string;
  unidad_compra: string | null;
  contenido_por_unidad_compra: number | null;
  mostrar_en_fracciones: boolean;
}

interface RegistrarCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  activeSucursalId: string | null;
  userId: string | null;
  proveedores: ProveedorRow[];
  productos: ProductoRow[];
  cicloAbierto: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function RegistrarCompraModal({
  isOpen,
  onClose,
  tenantId,
  activeSucursalId,
  userId,
  proveedores,
  productos,
  cicloAbierto,
  onSuccess,
  onError
}: RegistrarCompraModalProps) {
  const [saving, setSaving] = useState(false);
  const [compraForm, setCompraForm] = useState({
    proveedor_id: "",
    tipo_pago: "contado" as "contado" | "credito" | "parcial",
    metodo_pago: "efectivo" as "efectivo" | "tarjeta" | "transferencia" | "digital" | "",
    monto_pagado: "",
    numero_factura: "",
    observacion: "",
    itbis_facturado: "",
    itbis_retenido: "",
    retencion_isr: "",
    impuesto_selectivo: "",
    otros_impuestos: "",
    propina_legal: "",
    monto_servicios: "",
    tipo_bien_servicio: "09",
  });

  const [purchaseItems, setPurchaseItems] = useState<{
    id: string;
    producto_id: string;
    cantidad: string;
    costo_unitario: string;
  }[]>([{ id: crypto.randomUUID(), producto_id: "", cantidad: "", costo_unitario: "" }]);

  const isContado = compraForm.tipo_pago === "contado";
  const isParcial = compraForm.tipo_pago === "parcial";

  const runningTotal = useMemo(() => {
    const itemsTotal = purchaseItems.reduce((acc, item) => {
      const q = Number(item.cantidad) || 0;
      const c = Number(item.costo_unitario) || 0;
      return acc + (q * c);
    }, 0);
    return itemsTotal + (Number(compraForm.itbis_facturado) || 0) + (Number(compraForm.impuesto_selectivo) || 0) + (Number(compraForm.otros_impuestos) || 0) + (Number(compraForm.propina_legal) || 0);
  }, [purchaseItems, compraForm.itbis_facturado, compraForm.impuesto_selectivo, compraForm.otros_impuestos, compraForm.propina_legal]);

  if (!isOpen) return null;

  function addRow() {
    setPurchaseItems(prev => [...prev, { id: crypto.randomUUID(), producto_id: "", cantidad: "", costo_unitario: "" }]);
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

  async function handleRegistrarCompra(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;

    // Filter valid items
    const validItems = purchaseItems.filter(i => i.producto_id && Number(i.cantidad) > 0 && Number(i.costo_unitario) >= 0);
    if (validItems.length === 0) {
      onError("Debes agregar al menos un insumo válido con cantidad mayor a cero.");
      return;
    }

    const itemsPayload = validItems.map(item => ({
      producto_id: item.producto_id,
      cantidad: Number(item.cantidad),
      costo_unitario: Number(item.costo_unitario),
    }));

    let resolvedMontoPagado = 0;
    if (isParcial) {
      const pAmount = Number(compraForm.monto_pagado);
      if (isNaN(pAmount) || pAmount <= 0) {
        onError("El abono no puede ser menor o igual a cero.");
        return;
      }
      if (pAmount >= runningTotal) {
        onError("El abono no puede ser mayor o igual al total de la deuda.");
        return;
      }
      resolvedMontoPagado = pAmount;
    }

    setSaving(true);
    try {
      await registrarCompra({
        tenantId,
        sucursalId: activeSucursalId,
        usuarioId: userId,
        proveedorId: compraForm.proveedor_id || null,
        numeroFactura: compraForm.numero_factura.trim(),
        tipoPago: compraForm.tipo_pago,
        metodoPago: (isContado || isParcial) ? (compraForm.metodo_pago as any) : null,
        montoPagado: resolvedMontoPagado,
        items: itemsPayload,
        observacion: compraForm.observacion.trim(),
        itbisFacturado: Number(compraForm.itbis_facturado) || 0,
        itbisRetenido: Number(compraForm.itbis_retenido) || 0,
        retencionIsr: Number(compraForm.retencion_isr) || 0,
        impuestoSelectivo: Number(compraForm.impuesto_selectivo) || 0,
        otrosImpuestos: Number(compraForm.otros_impuestos) || 0,
        propinaLegal: Number(compraForm.propina_legal) || 0,
        montoServicios: Number(compraForm.monto_servicios) || 0,
        tipoBienServicio: compraForm.tipo_bien_servicio,
      });

      onSuccess("Compra registrada y stock actualizado correctamente.");
      setCompraForm({ proveedor_id: "", tipo_pago: "contado", metodo_pago: "efectivo", monto_pagado: "", numero_factura: "", observacion: "", itbis_facturado: "", itbis_retenido: "", retencion_isr: "", impuesto_selectivo: "", otros_impuestos: "", propina_legal: "", monto_servicios: "", tipo_bien_servicio: "09" });
      setPurchaseItems([{ id: crypto.randomUUID(), producto_id: "", cantidad: "", costo_unitario: "" }]);
      onClose();
    } catch (err: any) {
      onError(err.message || "Error al registrar la compra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[24px] shadow-[0px_0px_40px_rgba(255,144,109,0.1)] max-w-[1000px] w-full p-6 sm:p-8 relative flex flex-col max-h-[95vh] text-white">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase tracking-[0.5px] mb-5 shrink-0 text-left flex items-center gap-2">
          <span className="bg-[#ff906d]/10 text-[#ff906d] p-1.5 rounded-lg border border-[#ff906d]/20"><Plus className="size-5" /></span>
          Registrar Factura de Compra
        </h3>

        <form onSubmit={handleRegistrarCompra} className="flex flex-col gap-5 overflow-y-auto pr-2 flex-1 min-h-0 custom-scrollbar">
          {/* Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0 text-left bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] rounded-xl p-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Proveedor *</label>
              <select
                required
                value={compraForm.proveedor_id}
                onChange={(e) => setCompraForm(prev => ({ ...prev, proveedor_id: e.target.value }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors cursor-pointer"
              >
                <option value="">Selecciona proveedor</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.rnc || "S/RNC"})</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-1">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Tipo de Pago *</label>
              <select
                value={compraForm.tipo_pago}
                onChange={(e) => setCompraForm(prev => ({ ...prev, tipo_pago: e.target.value as any, metodo_pago: e.target.value === "credito" ? "" : "efectivo", monto_pagado: "" }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors cursor-pointer"
              >
                <option value="contado">Contado</option>
                <option value="parcial">Pago Parcial / Crédito</option>
                <option value="credito">Crédito Puro</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-1">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Número Factura / NCF *</label>
              <input
                type="text"
                required
                placeholder="Ej: B150004523"
                value={compraForm.numero_factura}
                onChange={(e) => setCompraForm(prev => ({ ...prev, numero_factura: e.target.value }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
              />
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] rounded-xl p-4 flex flex-col gap-4 shrink-0">
            <h4 className="font-['Space_Grotesk',sans-serif] text-white text-[13px] uppercase tracking-[1px] font-bold border-b border-[rgba(72,72,71,0.2)] pb-2">Datos Fiscales (606)</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Tipo Bien o Servicio</label>
                <select
                  value={compraForm.tipo_bien_servicio}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, tipo_bien_servicio: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors cursor-pointer"
                >
                  <option value="01">01 - Gastos de Personal</option>
                  <option value="02">02 - Gastos por Trabajos, Suministros y Servicios</option>
                  <option value="03">03 - Arrendamientos</option>
                  <option value="04">04 - Gastos de Activos Fijo</option>
                  <option value="05">05 - Gastos de Representación</option>
                  <option value="06">06 - Otras Deducciones Admitidas</option>
                  <option value="07">07 - Gastos Financieros</option>
                  <option value="08">08 - Gastos Extraordinarios</option>
                  <option value="09">09 - Compras y Gastos que formaran parte del Costo de Venta</option>
                  <option value="10">10 - Adquisiciones de Activos</option>
                  <option value="11">11 - Gastos de Seguros</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Monto Servicios</label>
                <input
                  type="number" min="0" step="0.01" placeholder="RD$ 0.00"
                  value={compraForm.monto_servicios}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, monto_servicios: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 text-left">
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">ITBIS Facturado</label>
                <input
                  type="number" min="0" step="0.01" placeholder="RD$ 0.00"
                  value={compraForm.itbis_facturado}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, itbis_facturado: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">ITBIS Retenido</label>
                <input
                  type="number" min="0" step="0.01" placeholder="RD$ 0.00"
                  value={compraForm.itbis_retenido}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, itbis_retenido: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Retención ISR</label>
                <input
                  type="number" min="0" step="0.01" placeholder="RD$ 0.00"
                  value={compraForm.retencion_isr}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, retencion_isr: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">ISC / Otros Imp.</label>
                <input
                  type="number" min="0" step="0.01" placeholder="RD$ 0.00"
                  value={compraForm.impuesto_selectivo}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, impuesto_selectivo: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Propina Legal</label>
                <input
                  type="number" min="0" step="0.01" placeholder="RD$ 0.00"
                  value={compraForm.propina_legal}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, propina_legal: e.target.value }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Conditional payment details (method and initial pay) */}
          {(isContado || isParcial) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 border border-[rgba(255,144,109,0.15)] bg-[rgba(255,144,109,0.02)] p-4 rounded-xl text-left">
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] uppercase tracking-[0.8px] font-semibold">Método de Pago *</label>
                <select
                  required
                  value={compraForm.metodo_pago}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, metodo_pago: e.target.value as any }))}
                  className="bg-[#111] border border-[rgba(255,144,109,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors cursor-pointer"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
              {isParcial && (
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] uppercase tracking-[0.8px] font-semibold">Monto Inicial Pagado (RD$) *</label>
                  <input
                    type="number"
                    required
                    step="any"
                    min="0.01"
                    placeholder="Ej: 5000"
                    value={compraForm.monto_pagado}
                    onChange={(e) => setCompraForm(prev => ({ ...prev, monto_pagado: e.target.value }))}
                    className="bg-[#111] border border-[rgba(255,144,109,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
                  />
                </div>
              )}
            </div>
          )}
          
          {!cicloAbierto && (
            <div className="bg-[rgba(255,113,108,0.08)] border border-[rgba(255,113,108,0.25)] rounded-[12px] p-3 text-[13px] text-[#ff716c] font-['Inter',sans-serif] shrink-0 text-left flex items-start gap-2">
              <span className="text-[16px] leading-none">⚠️</span>
              <p>
                <strong>Ciclo cerrado:</strong> Abrí un ciclo operativo antes de registrar una compra. Todas las compras, pagos y cuentas por pagar deben quedar vinculados a su ciclo.
              </p>
            </div>
          )}

          {/* Items Section */}
          <div className="flex flex-col gap-3 shrink-0 text-left bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] rounded-xl p-4">
            <div className="flex justify-between items-center pb-2">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px] uppercase tracking-[0.5px]">
                Insumos Comprados
              </span>
              <button
                type="button"
                onClick={addRow}
                className="bg-[rgba(255,144,109,0.1)] border border-[rgba(255,144,109,0.3)] text-[#ff906d] rounded-[8px] px-3 py-1.5 text-[11px] font-bold uppercase cursor-pointer hover:bg-[rgba(255,144,109,0.2)] transition-colors shadow-sm"
              >
                + Agregar Fila
              </button>
            </div>

            <div className="overflow-auto border border-[rgba(72,72,71,0.3)] rounded-xl max-h-[350px] bg-[#111] custom-scrollbar">
              <table className="w-full border-collapse">
                <thead className="bg-[#151515] sticky top-0 z-10 shadow-sm">
                  <tr className="text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] border-b border-[rgba(72,72,71,0.3)]">
                    <th className="px-4 py-3 font-semibold">Insumo / Materia Prima</th>
                    <th className="px-4 py-3 font-semibold w-[140px]">Cant.</th>
                    <th className="px-4 py-3 font-semibold w-[160px]">Costo (RD$)</th>
                    <th className="px-4 py-3 font-semibold w-[60px] text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                  {purchaseItems.map((item, idx) => {
                    const selectedProd = productos.find(p => p.id === item.producto_id);
                    const isFractional = selectedProd?.mostrar_en_fracciones && selectedProd.contenido_por_unidad_compra && selectedProd.contenido_por_unidad_compra > 0;
                    return (
                      <tr key={item.id} className="border-b border-[rgba(72,72,71,0.15)] last:border-b-0 hover:bg-[#151515] transition-colors group">
                        <td className="px-4 py-4 text-left align-top">
                          <select
                            required
                            value={item.producto_id}
                            onChange={(e) => updateRow(idx, "producto_id", e.target.value)}
                            className="w-full bg-[#1c1c1c] border border-[rgba(72,72,71,0.4)] rounded-[8px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors shadow-sm"
                          >
                            <option value="">Selecciona insumo</option>
                            {productos.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.nombre} {p.mostrar_en_fracciones && p.contenido_por_unidad_compra ? `(${p.unidad_compra || 'Fracc.'} de ${p.contenido_por_unidad_compra} ${p.unidad_base})` : `(${p.unidad_base})`}
                              </option>
                            ))}
                          </select>
                          {selectedProd && isFractional && item.cantidad && Number(item.cantidad) > 0 && (
                            <span className="text-[11px] text-[#ff906d] block mt-2 px-1 font-medium bg-[#ff906d]/10 w-fit rounded py-0.5 border border-[#ff906d]/20">
                              + {(Number(item.cantidad) * (selectedProd.contenido_por_unidad_compra || 0)).toLocaleString()} {selectedProd.unidad_base} al stock
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <input
                            type="number"
                            required
                            step="any"
                            min="0.01"
                            placeholder={isFractional ? (selectedProd.unidad_compra || "Cant.") : (selectedProd?.unidad_base || "Cantidad")}
                            value={item.cantidad}
                            onChange={(e) => updateRow(idx, "cantidad", e.target.value)}
                            className="w-full bg-[#1c1c1c] border border-[rgba(72,72,71,0.4)] rounded-[8px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors shadow-sm"
                          />
                          {selectedProd && (
                            <span className="block text-[10px] text-zinc-500 uppercase tracking-wide mt-2 px-1 font-semibold">
                              {isFractional ? `${selectedProd.unidad_compra || "Cajas"} comprad.` : `${selectedProd.unidad_base || "Cant."} comprad.`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <input
                            type="number"
                            required
                            step="any"
                            min="0"
                            placeholder={isFractional ? `Costo ${selectedProd.unidad_compra || "unidad"}` : "Costo Unit."}
                            value={item.costo_unitario}
                            onChange={(e) => updateRow(idx, "costo_unitario", e.target.value)}
                            className="w-full bg-[#1c1c1c] border border-[rgba(72,72,71,0.4)] rounded-[8px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors shadow-sm"
                          />
                          {selectedProd && (
                            <span className="block text-[10px] text-zinc-500 uppercase tracking-wide mt-2 px-1 font-semibold">
                              x {isFractional ? (selectedProd.unidad_compra || "caja") : (selectedProd.unidad_base || "unidad")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center align-top pt-5">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="bg-transparent border-none text-[#ff716c] hover:text-[#ff3831] hover:bg-[#ff716c]/10 p-2 rounded-lg cursor-pointer transition-colors"
                            title="Remover Fila"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {purchaseItems.some(i => i.producto_id) && (
              <div className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-xl p-3.5 text-[12px] text-[#adaaaa] font-['Inter',sans-serif] shrink-0 mt-2 text-left shadow-sm">
                <span className="font-bold text-white uppercase tracking-[0.5px] block mb-2 text-[11px]">Resumen de Incremento de Inventario</span>
                <ul className="list-disc pl-5 flex flex-col gap-1.5">
                  {purchaseItems.map((item) => {
                    const prod = productos.find(p => p.id === item.producto_id);
                    const q = Number(item.cantidad) || 0;
                    if (!prod || q <= 0) return null;
                    const isFractional = prod.mostrar_en_fracciones && prod.contenido_por_unidad_compra && prod.contenido_por_unidad_compra > 0;
                    const addedBase = isFractional ? (q * (prod.contenido_por_unidad_compra || 0)) : q;
                    return (
                      <li key={item.id} className="marker:text-[#ff906d]">
                        <b className="text-white">{prod.nombre}:</b> +{q.toLocaleString()} {isFractional ? `${prod.unidad_compra || 'Cajas'} (${addedBase.toLocaleString()} ${prod.unidad_base})` : `${prod.unidad_base}`} agregados al stock.
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Extra notes */}
          <div className="flex flex-col gap-1.5 shrink-0 text-left bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] rounded-xl p-4">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Observaciones</label>
            <textarea
              placeholder="Detalles extra de la compra, condiciones de recepción, etc."
              value={compraForm.observacion}
              onChange={(e) => setCompraForm(prev => ({ ...prev, observacion: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-4 py-3 font-['Inter',sans-serif] text-white text-[13px] outline-none h-[70px] resize-none focus:border-[#ff906d]/60 transition-colors shadow-sm"
            />
          </div>

          {/* Summary and Buttons */}
          <div className="flex justify-between items-center pt-5 border-t border-[rgba(72,72,71,0.2)] mt-2 shrink-0">
            <div className="flex flex-col text-left">
              <span className="text-[11px] text-[#adaaaa] uppercase tracking-[0.8px] font-['Inter',sans-serif] font-semibold">Monto Total Factura:</span>
              <span className="font-['Space_Grotesk',sans-serif] font-black text-white text-[22px]">
                {RD(runningTotal)}
              </span>
              {isParcial && compraForm.monto_pagado && (
                <span className="text-[12px] text-[#ff906d] font-medium mt-0.5">
                  Paga hoy: {RD(Number(compraForm.monto_pagado) || 0)} <span className="text-[#adaaaa] mx-1">·</span> Pendiente: {RD(Math.max(0, runningTotal - (Number(compraForm.monto_pagado) || 0)))}
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-[#262626] text-[#adaaaa] rounded-[10px] px-5 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase cursor-pointer border-none hover:bg-zinc-800 hover:text-white transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !cicloAbierto}
                className="bg-[#ff906d] rounded-[10px] px-6 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff906d]/90 hover:shadow-[0_0_15px_rgba(255,144,109,0.3)] transition-all"
              >
                {saving ? "Registrando..." : "Guardar Compra"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
