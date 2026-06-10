import { FormEvent, useEffect, useState } from "react";
import { enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";

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

interface ProveedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  editingProveedor: ProveedorRow | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function ProveedorModal({
  isOpen,
  onClose,
  tenantId,
  editingProveedor,
  onSuccess,
  onError
}: ProveedorModalProps) {
  const [saving, setSaving] = useState(false);
  const [proveedorForm, setProveedorForm] = useState({
    nombre: "",
    rnc: "",
    telefono: "",
    email: "",
    direccion: "",
  });

  useEffect(() => {
    if (editingProveedor) {
      setProveedorForm({
        nombre: editingProveedor.nombre || "",
        rnc: editingProveedor.rnc || "",
        telefono: editingProveedor.telefono || "",
        email: editingProveedor.email || "",
        direccion: editingProveedor.direccion || "",
      });
    } else {
      setProveedorForm({
        nombre: "",
        rnc: "",
        telefono: "",
        email: "",
        direccion: "",
      });
    }
  }, [editingProveedor, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const nombre = proveedorForm.nombre.trim();
    if (!nombre) return;

    setSaving(true);
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

      onSuccess(isEditing ? "Proveedor actualizado correctamente." : "Proveedor creado correctamente.");
      onClose();
    } catch (err: any) {
      onError(err.message || "Error al guardar proveedor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[440px] w-full p-6 relative text-white">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4 text-left">
          {editingProveedor ? "Editar Proveedor" : "Agregar Proveedor"}
        </h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
          <div className="flex flex-col gap-1.5">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Nombre Comercial *</label>
            <input
              type="text"
              required
              placeholder="Ej: Brugal & Co. / Distribuidora Almonte"
              value={proveedorForm.nombre}
              onChange={(e) => setProveedorForm(prev => ({ ...prev, nombre: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
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
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Teléfono</label>
              <input
                type="text"
                placeholder="Ej: 809-555-0199"
                value={proveedorForm.telefono}
                onChange={(e) => setProveedorForm(prev => ({ ...prev, telefono: e.target.value }))}
                className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
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
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Dirección física</label>
            <textarea
              placeholder="Ej: Av. Winston Churchill #15, Santo Domingo"
              value={proveedorForm.direccion}
              onChange={(e) => setProveedorForm(prev => ({ ...prev, direccion: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2 font-['Inter',sans-serif] text-white text-[13px] outline-none h-[60px] resize-none focus:border-[#ff906d]/50 transition-colors"
            />
          </div>

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
              {saving ? "Guardando..." : "Guardar Proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
