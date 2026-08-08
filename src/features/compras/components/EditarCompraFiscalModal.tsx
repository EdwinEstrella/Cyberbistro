import { FormEvent, useEffect, useState } from "react";
import { Edit } from "lucide-react";
import { actualizarDatosFiscalesCompra } from "../lib/purchaseService";
import type { CompraRow, ProveedorRow } from "./Compras";

interface EditarCompraFiscalModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  compra: CompraRow | null;
  proveedores: ProveedorRow[];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function EditarCompraFiscalModal({
  isOpen,
  onClose,
  tenantId,
  compra,
  proveedores,
  onSuccess,
  onError
}: EditarCompraFiscalModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    proveedor_id: "",
    numero_factura: "",
    fecha_compra: "",
    observacion: "",
  });

  useEffect(() => {
    if (compra) {
      let safeDate = new Date().toISOString().slice(0, 16);
      try {
        if (compra.fecha_compra) {
          const d = new Date(compra.fecha_compra);
          if (!isNaN(d.getTime())) {
            safeDate = d.toISOString().slice(0, 16);
          }
        }
      } catch (e) {
        console.error("Invalid date format in compra", e);
      }

      setFormData({
        proveedor_id: compra.proveedor_id || "",
        numero_factura: compra.numero_factura || "",
        fecha_compra: safeDate,
        observacion: compra.observacion || "",
      });
    }
  }, [compra]);

  if (!isOpen || !compra) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;

    setSaving(true);
    try {
      const d = new Date(formData.fecha_compra);
      const safeIso = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();

      await actualizarDatosFiscalesCompra(tenantId, compra.id, {
        proveedorId: formData.proveedor_id,
        numeroFactura: formData.numero_factura,
        fechaCompra: safeIso,
        observacion: formData.observacion,
      });
      onSuccess("Datos fiscales actualizados correctamente.");
      onClose();
    } catch (err: any) {
      onError(err.message || "Error al actualizar los datos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[24px] shadow-[0px_0px_40px_rgba(255,144,109,0.1)] max-w-[600px] w-full p-6 sm:p-8 relative flex flex-col text-white">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase tracking-[0.5px] mb-5 shrink-0 text-left flex items-center gap-2">
          <span className="bg-[#ff906d]/10 text-[#ff906d] p-1.5 rounded-lg border border-[#ff906d]/20"><Edit className="size-5" /></span>
          Editar Datos Fiscales
        </h3>

        <div className="bg-[rgba(255,144,109,0.05)] border border-[rgba(255,144,109,0.15)] rounded-xl p-3.5 mb-5 text-[12px] text-[#adaaaa] font-['Inter',sans-serif] leading-relaxed">
          <strong className="text-white block mb-1">Aviso de Auditoría:</strong>
          Esta edición es estrictamente para correcciones fiscales (NCF, Fechas y Proveedor). Para proteger tu Kárdex y Costo Promedio, <b>los insumos y el monto total no pueden ser alterados</b>. Si necesitas cambiar los insumos, debes anular esta compra y registrarla nuevamente.
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Proveedor *</label>
            <select
              required
              value={formData.proveedor_id}
              onChange={(e) => setFormData(prev => ({ ...prev, proveedor_id: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors cursor-pointer"
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.rnc || "S/RNC"})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Número Factura / NCF *</label>
              <input
                type="text"
                required
                placeholder="Ej: B150004523"
                value={formData.numero_factura}
                onChange={(e) => setFormData(prev => ({ ...prev, numero_factura: e.target.value }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Fecha de Factura *</label>
              <input
                type="datetime-local"
                required
                value={formData.fecha_compra}
                onChange={(e) => setFormData(prev => ({ ...prev, fecha_compra: e.target.value }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold">Observaciones</label>
            <textarea
              placeholder="Detalles extra de la compra..."
              value={formData.observacion}
              onChange={(e) => setFormData(prev => ({ ...prev, observacion: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-4 py-3 font-['Inter',sans-serif] text-white text-[13px] outline-none h-[70px] resize-none focus:border-[#ff906d]/60 transition-colors shadow-sm"
            />
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[rgba(72,72,71,0.2)]">
            <button
              type="button"
              onClick={onClose}
              className="bg-[#262626] text-[#adaaaa] rounded-[10px] px-5 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase cursor-pointer border-none hover:bg-zinc-800 hover:text-white transition-colors shadow-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-[#ff906d] rounded-[10px] px-6 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff906d]/90 transition-all"
            >
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
