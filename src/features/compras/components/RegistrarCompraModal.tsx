import { FormEvent, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
  ml_por_botella: number | null;
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
    return purchaseItems.reduce((acc, item) => {
      const q = Number(item.cantidad) || 0;
      const c = Number(item.costo_unitario) || 0;
      return acc + (q * c);
    }, 0);
  }, [purchaseItems]);

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
      });

      onSuccess("Compra registrada y stock actualizado correctamente.");
      setCompraForm({ proveedor_id: "", tipo_pago: "contado", metodo_pago: "efectivo", monto_pagado: "", numero_factura: "", observacion: "" });
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
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[700px] w-full p-6 relative flex flex-col max-h-[90vh] text-white">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4 shrink-0 text-left">
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
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none focus:border-[#ff906d]/50 transition-colors cursor-pointer"
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
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none focus:border-[#ff906d]/50 transition-colors cursor-pointer"
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
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[12.5px] outline-none focus:border-[#ff906d]/50 transition-colors"
              />
            </div>
          </div>

          {/* Conditional payment details (method and initial pay) */}
          {(isContado || isParcial) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0 border border-zinc-800 bg-zinc-950/20 p-3 rounded-[12px] text-left">
              <div className="flex flex-col gap-1.5">
                <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Método de Pago *</label>
                <select
                  required
                  value={compraForm.metodo_pago}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, metodo_pago: e.target.value as any }))}
                  className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none focus:border-[#ff906d]/50 transition-colors cursor-pointer"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
              {isParcial && (
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
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[12.5px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
              )}
            </div>
          )}
          
          {(isContado || isParcial) && !cicloAbierto && (
            <div className="bg-[rgba(255,113,108,0.08)] border border-[rgba(255,113,108,0.25)] rounded-[10px] p-3 text-[12px] text-[#ff716c] font-['Inter',sans-serif] shrink-0 text-left">
              ⚠️ <strong>Caja Cerrada:</strong> No hay un ciclo operativo abierto. Debes abrir uno en la sección de Cierre antes de registrar compras con cobro inmediato.
            </div>
          )}

          {/* Items Section */}
          <div className="flex flex-col gap-2 flex-1 min-h-0 text-left">
            <div className="flex justify-between items-center">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] uppercase">
                Insumos Comprados
              </span>
              <button
                type="button"
                onClick={addRow}
                className="bg-[#262626] border border-[rgba(255,144,109,0.25)] text-[#ff906d] rounded-[6px] px-2.5 py-1 text-[10.5px] font-bold uppercase cursor-pointer hover:bg-zinc-800 transition-colors"
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
                      <tr key={item.id} className="border-t border-[rgba(72,72,71,0.1)]">
                        <td className="px-2.5 py-2 text-left">
                          <select
                            required
                            value={item.producto_id}
                            onChange={(e) => updateRow(idx, "producto_id", e.target.value)}
                            className="w-full bg-[#151515] border border-[rgba(72,72,71,0.3)] rounded-[6px] px-2 py-1.5 text-white outline-none focus:border-[#ff906d]/50 transition-colors"
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
                            className="w-full bg-[#151515] border border-[rgba(72,72,71,0.3)] rounded-[6px] px-2 py-1.5 text-white outline-none focus:border-[#ff906d]/50 transition-colors"
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
                            className="w-full bg-[#151515] border border-[rgba(72,72,71,0.3)] rounded-[6px] px-2 py-1.5 text-white outline-none focus:border-[#ff906d]/50 transition-colors"
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
                  {purchaseItems.map((item) => {
                    const prod = productos.find(p => p.id === item.producto_id);
                    const q = Number(item.cantidad) || 0;
                    if (!prod || q <= 0) return null;
                    const isLiquid = prod.ml_por_botella && prod.ml_por_botella > 0;
                    const addedBase = isLiquid ? (q * (prod.ml_por_botella || 0)) : q;
                    return (
                      <li key={item.id}>
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
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none h-[60px] resize-none focus:border-[#ff906d]/50 transition-colors"
            />
          </div>

          {/* Summary and Buttons */}
          <div className="flex justify-between items-center pt-3 border-t border-[rgba(72,72,71,0.15)] mt-1 shrink-0">
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">Monto Total Factura:</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px]">
                {RD(runningTotal)}
              </span>
              {isParcial && compraForm.monto_pagado && (
                <span className="text-[11px] text-[#ff906d]">
                  Paga hoy: {RD(Number(compraForm.monto_pagado) || 0)} · Pendiente: {RD(Math.max(0, runningTotal - (Number(compraForm.monto_pagado) || 0)))}
                </span>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="bg-[#262626] text-[#adaaaa] rounded-[8px] px-4 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[10.5px] uppercase cursor-pointer border-none hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || ((isContado || isParcial) && !cicloAbierto)}
                className="bg-[#ff906d] rounded-[8px] px-4 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[10.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff906d]/90 transition-colors"
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
