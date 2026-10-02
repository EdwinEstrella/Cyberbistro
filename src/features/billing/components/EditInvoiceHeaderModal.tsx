import { FormEvent, useEffect, useState } from "react";
import { Edit } from "lucide-react";
import {
  isNcfLocked,
  validateInvoiceHeaderEdit,
  type InvoiceHeaderField,
  type InvoiceHeaderOriginal,
} from "../lib/invoiceHeaderEdit";
import { updateInvoiceHeader } from "../lib/invoicesLocal";

export interface EditableInvoice extends InvoiceHeaderOriginal {
  id: string;
  numero_factura: number;
  created_at: string;
  total: number;
}

interface EditInvoiceHeaderModalProps {
  invoice: EditableInvoice | null;
  tenantId: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const LABEL_CLASS = "font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px] font-semibold";
const INPUT_CLASS =
  "bg-[#111] border border-[rgba(72,72,71,0.4)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/60 transition-colors disabled:opacity-50";

export function EditInvoiceHeaderModal({ invoice, tenantId, onClose, onSaved }: EditInvoiceHeaderModalProps) {
  const [form, setForm] = useState({ ncf: "", cliente_nombre: "", cliente_rnc: "", notas: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<InvoiceHeaderField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setForm({
      ncf: invoice.ncf ?? "",
      cliente_nombre: invoice.cliente_nombre ?? "",
      cliente_rnc: invoice.cliente_rnc ?? "",
      notas: invoice.notas ?? "",
    });
    setFieldErrors({});
    setFormError(null);
  }, [invoice]);

  if (!invoice) return null;
  const ncfLocked = isNcfLocked(invoice);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!invoice || !tenantId) return;
    const result = validateInvoiceHeaderEdit(invoice, form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    if (!result.changed) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateInvoiceHeader(tenantId, invoice.id, result.changes);
      await onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el encabezado de la factura.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[24px] shadow-[0px_0px_40px_rgba(255,144,109,0.1)] max-w-[560px] w-full p-6 sm:p-8 relative flex flex-col text-white">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase tracking-[0.5px] mb-5 text-left flex items-center gap-2">
          <span className="bg-[#ff906d]/10 text-[#ff906d] p-1.5 rounded-lg border border-[#ff906d]/20"><Edit className="size-5" /></span>
          Editar Factura #{String(invoice.numero_factura).padStart(4, "0")}
        </h3>

        <div className="bg-[rgba(255,144,109,0.05)] border border-[rgba(255,144,109,0.15)] rounded-xl p-3.5 mb-5 text-[12px] text-[#adaaaa] font-['Inter',sans-serif] leading-relaxed">
          <strong className="text-white block mb-1">Solo encabezado:</strong>
          Puedes corregir NCF, cliente, RNC y notas. Los productos y los montos <b>no se pueden modificar</b>.
          <div className="mt-2 text-white/80">
            {new Date(invoice.created_at).toLocaleString("es-DO")} · Total {new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(invoice.total)}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-inv-ncf" className={LABEL_CLASS}>NCF</label>
            <input
              id="edit-inv-ncf"
              type="text"
              maxLength={11}
              placeholder="Ej: B0200000001"
              disabled={ncfLocked}
              value={form.ncf}
              onChange={(e) => setForm((prev) => ({ ...prev, ncf: e.target.value.toUpperCase() }))}
              className={INPUT_CLASS}
            />
            {ncfLocked && <span className="text-[11px] text-[#adaaaa]">El NCF de un comprobante electrónico (e-CF) no se puede editar.</span>}
            {fieldErrors.ncf && <span role="alert" className="text-[11px] text-red-400">{fieldErrors.ncf}</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-inv-nombre" className={LABEL_CLASS}>Cliente</label>
              <input
                id="edit-inv-nombre"
                type="text"
                value={form.cliente_nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, cliente_nombre: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-inv-rnc" className={LABEL_CLASS}>RNC / Cédula</label>
              <input
                id="edit-inv-rnc"
                type="text"
                value={form.cliente_rnc}
                onChange={(e) => setForm((prev) => ({ ...prev, cliente_rnc: e.target.value }))}
                className={INPUT_CLASS}
              />
              {fieldErrors.cliente_rnc && <span role="alert" className="text-[11px] text-red-400">{fieldErrors.cliente_rnc}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-inv-notas" className={LABEL_CLASS}>Notas</label>
            <textarea
              id="edit-inv-notas"
              value={form.notas}
              onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
              className={`${INPUT_CLASS} h-[70px] resize-none`}
            />
          </div>

          {formError && <div role="alert" className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[rgba(72,72,71,0.2)]">
            <button
              type="button"
              onClick={onClose}
              className="bg-[#262626] text-[#adaaaa] rounded-[10px] px-5 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase cursor-pointer border-none hover:bg-zinc-800 hover:text-white transition-colors"
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
