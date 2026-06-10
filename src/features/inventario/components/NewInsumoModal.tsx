import { FormEvent, useState } from "react";
import { enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";
import { calculateCostPerFraction, parentAndFractionsToTotal } from "../../../shared/lib/presentationUnits";

export const CATEGORIAS_INSUMO = ["Cocina / Cocina", "Insumo / Materia Prima", "Bebidas / Bar", "Desechables", "Otros"];
export const UNIDADES_MEDIDA = ["ml", "g", "unidad", "oz", "libra", "litro", "galón"];

interface NewInsumoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  activeSucursalId: string | null;
  userId: string | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function NewInsumoModal({
  isOpen,
  onClose,
  tenantId,
  activeSucursalId,
  userId,
  onSuccess,
  onError
}: NewInsumoModalProps) {
  const [saving, setSaving] = useState(false);
  const [insumoForm, setInsumoForm] = useState({
    nombre: "",
    categoria: "Insumo / Materia Prima",
    unidad_base: "unidad",
    tipo_control: "simple" as "simple" | "fraccionado",
    stock_minimo: "",
    stock_minimo_parent: "",
    stock_minimo_fraction: "",
    stock_actual: "",
    stock_actual_parent: "",
    stock_actual_fraction: "",
    costo_promedio: "",
    contenido_por_unidad_compra: "",
    costo_unidad_compra: "",
    unidad_compra: "Caja",
  });

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const nombre = insumoForm.nombre.trim();
    if (!nombre) return;

    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const isFraccionado = insumoForm.tipo_control === "fraccionado";
      const contenidoPorUnidad = isFraccionado ? (Number(insumoForm.contenido_por_unidad_compra) || 0) : 0;
      const costoCompra = isFraccionado ? (Number(insumoForm.costo_unidad_compra) || 0) : 0;

      if (isFraccionado && contenidoPorUnidad <= 0) {
        throw new Error("El contenido por unidad de compra debe ser mayor a cero.");
      }

      let stock = 0;
      let min = 0;

      if (isFraccionado) {
        const stockParent = Number(insumoForm.stock_actual_parent) || 0;
        const stockFraction = Number(insumoForm.stock_actual_fraction) || 0;
        if (stockParent < 0 || stockFraction < 0) {
          throw new Error("El stock inicial no puede ser negativo.");
        }
        stock = parentAndFractionsToTotal(stockParent, contenidoPorUnidad, stockFraction);

        const minParent = Number(insumoForm.stock_minimo_parent) || 0;
        const minFraction = Number(insumoForm.stock_minimo_fraction) || 0;
        if (minParent < 0 || minFraction < 0) {
          throw new Error("El stock mínimo de alerta no puede ser negativo.");
        }
        min = parentAndFractionsToTotal(minParent, contenidoPorUnidad, minFraction);
      } else {
        stock = Number(insumoForm.stock_actual) || 0;
        min = Number(insumoForm.stock_minimo) || 0;
        if (stock < 0 || min < 0) {
          throw new Error("El stock inicial y mínimo no pueden ser negativos.");
        }
      }

      const costo = (isFraccionado && contenidoPorUnidad > 0 && costoCompra > 0)
        ? calculateCostPerFraction(costoCompra, contenidoPorUnidad)
        : (Number(insumoForm.costo_promedio) || 0);

      const payload = {
        id,
        tenant_id: tenantId,
        sucursal_id: activeSucursalId,
        nombre,
        categoria: insumoForm.categoria,
        unidad_base: insumoForm.unidad_base,
        stock_actual: stock,
        stock_minimo: min,
        costo_promedio: costo,
        contenido_por_unidad_compra: contenidoPorUnidad > 0 ? contenidoPorUnidad : null,
        costo_unidad_compra: costoCompra > 0 ? costoCompra : null,
        unidad_compra: isFraccionado ? insumoForm.unidad_compra : null,
        mostrar_en_fracciones: isFraccionado,
        activo: true,
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "productos_inventario",
        rowId: id,
        op: "insert",
        payload,
        deviceId: await getDeviceId(),
      });

      // Write an initial "ajuste" movement if stock was set > 0
      if (stock > 0) {
        const movId = crypto.randomUUID();
        await enqueueLocalWrite({
          tenantId,
          tableName: "inventario_movimientos",
          rowId: movId,
          op: "insert",
          payload: {
            id: movId,
            tenant_id: tenantId,
            sucursal_id: activeSucursalId,
            producto_id: id,
            tipo: "ajuste",
            shadow_dirty: true,
            cantidad: stock,
            stock_antes: 0,
            stock_despues: stock,
            costo_unitario: isFraccionado ? calculateCostPerFraction(costoCompra, contenidoPorUnidad) : costo,
            motivo: "Carga inicial de inventario",
            referencia: "Carga Inicial",
            fecha: new Date().toISOString(),
            usuario_id: userId || null,
          },
          deviceId: await getDeviceId(),
        });
      }

      onSuccess("Insumo creado correctamente.");
      onClose();
    } catch (err: any) {
      onError(err.message || "Error al crear insumo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[460px] w-full p-6 relative text-white">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4 text-left">
          Agregar Materia Prima
        </h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-left">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Nombre del Insumo *</label>
            <input
              type="text"
              required
              placeholder="Ej: Aceite de Soya / Papa Americana"
              value={insumoForm.nombre}
              onChange={(e) => setInsumoForm(prev => ({ ...prev, nombre: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="flex flex-col gap-1.5">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Categoría *</label>
              <select
                value={insumoForm.categoria}
                onChange={(e) => setInsumoForm(prev => ({ ...prev, categoria: e.target.value }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
              >
                {CATEGORIAS_INSUMO.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Presentación *</label>
              <select
                value={insumoForm.tipo_control}
                onChange={(e) => setInsumoForm(prev => ({ ...prev, tipo_control: e.target.value as any }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
              >
                <option value="simple">Simple (Unidad, gramos, etc.)</option>
                <option value="fraccionado">Fraccionado (Caja, Galón, Saco)</option>
              </select>
            </div>
          </div>

          {insumoForm.tipo_control === "fraccionado" ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] uppercase tracking-[0.5px]">Se compra en: (Ej. Caja, Saco) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Caja, Galón, Saco"
                    value={insumoForm.unidad_compra}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, unidad_compra: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] uppercase tracking-[0.5px]">Se fracciona en: *</label>
                  <select
                    value={insumoForm.unidad_base}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, unidad_base: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  >
                    {UNIDADES_MEDIDA.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border border-[rgba(255,144,109,0.22)] bg-[rgba(255,144,109,0.04)] p-3.5 rounded-[12px] flex flex-col gap-2 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] uppercase tracking-[0.5px]">Cant. de {insumoForm.unidad_base || 'fracciones'} por {insumoForm.unidad_compra || 'unidad'} *</label>
                  <input
                    type="number"
                    required
                    step="any"
                    min="1"
                    placeholder="Ej: 24"
                    value={insumoForm.contenido_por_unidad_compra}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, contenido_por_unidad_compra: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] uppercase tracking-[0.5px]">Costo por {insumoForm.unidad_compra || 'Caja'} (RD$)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ej: 850.00"
                    value={insumoForm.costo_unidad_compra}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, costo_unidad_compra: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="flex flex-col gap-1.5 border border-zinc-800 bg-zinc-950/20 p-3 rounded-xl">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[9px] uppercase tracking-[0.5px] mb-1 block text-left">Stock Inicial</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      min="0"
                      placeholder={insumoForm.unidad_compra || "Cajas"}
                      value={insumoForm.stock_actual_parent}
                      onChange={(e) => setInsumoForm(prev => ({ ...prev, stock_actual_parent: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.25)] rounded-[8px] px-2 py-1.5 font-['Inter',sans-serif] text-white text-[12px] outline-none text-center focus:border-[#ff906d]/50 transition-colors"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder={`${insumoForm.unidad_base || "unidades"} extra`}
                      value={insumoForm.stock_actual_fraction}
                      onChange={(e) => setInsumoForm(prev => ({ ...prev, stock_actual_fraction: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.25)] rounded-[8px] px-2 py-1.5 font-['Inter',sans-serif] text-white text-[12px] outline-none text-center focus:border-[#ff906d]/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 border border-zinc-800 bg-zinc-950/20 p-3 rounded-xl">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[9px] uppercase tracking-[0.5px] mb-1 block text-left">Alerta Mínimo</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      min="0"
                      placeholder={insumoForm.unidad_compra || "Cajas"}
                      value={insumoForm.stock_minimo_parent}
                      onChange={(e) => setInsumoForm(prev => ({ ...prev, stock_minimo_parent: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.25)] rounded-[8px] px-2 py-1.5 font-['Inter',sans-serif] text-white text-[12px] outline-none text-center focus:border-[#ff906d]/50 transition-colors"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder={`${insumoForm.unidad_base || "unidades"} extra`}
                      value={insumoForm.stock_minimo_fraction}
                      onChange={(e) => setInsumoForm(prev => ({ ...prev, stock_minimo_fraction: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.25)] rounded-[8px] px-2 py-1.5 font-['Inter',sans-serif] text-white text-[12px] outline-none text-center focus:border-[#ff906d]/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Unidad de Medida *</label>
                  <select
                    value={insumoForm.unidad_base}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, unidad_base: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  >
                    {UNIDADES_MEDIDA.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Costo Inicial (RD$)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={insumoForm.costo_promedio}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, costo_promedio: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Stock Inicial</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={insumoForm.stock_actual}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, stock_actual: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Alerta Mínimo</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={insumoForm.stock_minimo}
                    onChange={(e) => setInsumoForm(prev => ({ ...prev, stock_minimo: e.target.value }))}
                    className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-[#262626] text-[#adaaaa] rounded-[10px] px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-[#ff906d] rounded-[10px] px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff906d]/90 transition-colors"
            >
              {saving ? "Guardando..." : "Crear Insumo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
