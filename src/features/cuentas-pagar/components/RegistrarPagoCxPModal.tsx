import { FormEvent, useEffect, useState } from "react";
import { registrarPagoCxP } from "../lib/accountsPayableService";

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

interface RegistrarPagoCxPModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  activeSucursalId: string | null;
  userId: string | null;
  selectedCuenta: CuentaPagarRow;
  proveedorNombre: string;
  cicloAbierto: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const RD = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RegistrarPagoCxPModal({
  isOpen,
  onClose,
  tenantId,
  activeSucursalId,
  userId,
  selectedCuenta,
  proveedorNombre,
  cicloAbierto,
  onSuccess,
  onError,
}: RegistrarPagoCxPModalProps) {
  const [saving, setSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    monto: "",
    metodoPago: "transferencia" as "efectivo" | "tarjeta" | "transferencia" | "digital",
    notas: "",
  });

  useEffect(() => {
    if (isOpen && selectedCuenta) {
      const balance = Number((selectedCuenta.monto_total - selectedCuenta.monto_pagado).toFixed(2));
      setPaymentForm({
        monto: balance.toString(),
        metodoPago: "transferencia",
        notas: "",
      });
    }
  }, [isOpen, selectedCuenta]);

  if (!isOpen) return null;

  async function handleRegistrarAbono(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !selectedCuenta) return;
    const amountVal = Number(paymentForm.monto);
    if (amountVal <= 0) {
      onError("El monto debe ser mayor a cero.");
      return;
    }

    setSaving(true);
    try {
      await registrarPagoCxP({
        tenantId,
        sucursalId: activeSucursalId,
        usuarioId: userId,
        cuentaPagarId: selectedCuenta.id,
        monto: amountVal,
        metodoPago: paymentForm.metodoPago,
        notas: paymentForm.notas.trim(),
      });

      onSuccess("Abono registrado correctamente.");
      onClose();
    } catch (err: any) {
      onError(err.message || "Error al registrar abono.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[440px] w-full p-6 relative">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px] mb-4">
          Registrar Abono a Proveedor
        </h3>

        <div className="bg-[#171717] border border-[rgba(72,72,71,0.18)] rounded-[12px] p-3 mb-4 font-['Inter',sans-serif] text-[13px] text-white">
          <div className="flex justify-between">
            <span className="text-[#adaaaa]">Proveedor:</span>
            <span className="font-bold">{proveedorNombre}</span>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[#adaaaa]">Total Deuda:</span>
            <span>{RD(selectedCuenta.monto_total)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[#adaaaa]">Saldo Pendiente:</span>
            <span className="text-[#ff716c] font-bold">
              {RD(selectedCuenta.monto_total - selectedCuenta.monto_pagado)}
            </span>
          </div>
        </div>

        <form onSubmit={handleRegistrarAbono} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">
              Monto del Abono *
            </label>
            <input
              type="number"
              required
              step="0.01"
              min="0.01"
              max={Number((selectedCuenta.monto_total - selectedCuenta.monto_pagado).toFixed(2))}
              value={paymentForm.monto}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, monto: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2.5 font-['Inter',sans-serif] text-white text-[13px] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">
              Método de Pago *
            </label>
            <select
              required
              value={paymentForm.metodoPago}
              onChange={(e) =>
                setPaymentForm((prev) => ({
                  ...prev,
                  metodoPago: e.target.value as any,
                }))
              }
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
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">
              Notas / Comentarios
            </label>
            <textarea
              placeholder="Ej: Transferencia del Banco Popular, recibo #12345"
              value={paymentForm.notas}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, notas: e.target.value }))}
              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2 font-['Inter',sans-serif] text-white text-[13px] outline-none h-[60px] resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={onClose}
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
  );
}
