import { useEffect, useState } from "react";
import { X, Receipt, DollarSign, Calendar, Info } from "lucide-react";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { insforgeClient } from "../../../shared/lib/insforge";

interface CuentaCobrarRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  factura_id: string | null;
  customer_id: string;
  monto_total: number;
  monto_pagado: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: "pendiente" | "parcial" | "pagada";
  observacion: string | null;
}

interface CxcPagoRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  cuenta_cobrar_id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
  notas: string | null;
}

interface DetalleCuentaCobrarModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  cuenta: CuentaCobrarRow | null;
  clienteNombre: string;
  facturaNumero: string;
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

export function DetalleCuentaCobrarModal({
  isOpen,
  onClose,
  tenantId,
  cuenta,
  clienteNombre,
  facturaNumero,
}: DetalleCuentaCobrarModalProps) {
  const [pagos, setPagos] = useState<CxcPagoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !tenantId || !cuenta) return;

    const currentTenantId = tenantId;
    const currentCuenta = cuenta;

    async function loadPagos() {
      setLoading(true);
      setError("");
      try {
        const useLocal = await shouldReadLocalFirst(currentTenantId, ["cxc_pagos"]);
        let data: CxcPagoRow[] = [];

        if (useLocal) {
          const allPagos = await readLocalMirror<CxcPagoRow>(currentTenantId, "cxc_pagos");
          data = allPagos.filter(d => d.cuenta_cobrar_id === currentCuenta.id);
        } else {
          const res = await insforgeClient.database
            .from("cxc_pagos")
            .select("*")
            .eq("cuenta_cobrar_id", currentCuenta.id);
          if (res.error) throw res.error;
          data = res.data || [];
        }

        setPagos(data.sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago)));
      } catch (err: any) {
        setError(err.message || "Error al cargar el historial de cobros.");
      } finally {
        setLoading(false);
      }
    }

    void loadPagos();
  }, [isOpen, tenantId, cuenta]);

  if (!isOpen || !cuenta) return null;

  const balance = cuenta.monto_total - cuenta.monto_pagado;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[640px] w-full max-h-[85vh] flex flex-col text-white overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-[rgba(72,72,71,0.18)] shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-[#ff906d]" />
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px]">
              Detalle de Cuenta por Cobrar
            </h3>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-[#adaaaa] hover:text-white cursor-pointer transition-colors p-1"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4 bg-[#1a1a1a] rounded-xl p-4 border border-[rgba(72,72,71,0.1)] text-sm">
            <div className="flex flex-col gap-1 col-span-2">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Cliente</span>
              <span className="font-bold text-white text-base">
                {clienteNombre}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Factura POS</span>
              <span className="font-mono font-bold text-white text-sm">
                {facturaNumero}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Estado</span>
              <div>
                <span className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold uppercase inline-block ${
                  cuenta.estado === "pagada"
                    ? "bg-[rgba(89,238,80,0.12)] text-[#59ee50]"
                    : cuenta.estado === "parcial"
                    ? "bg-[rgba(255,144,109,0.12)] text-[#ff906d]"
                    : "bg-[rgba(255,113,108,0.12)] text-[#ff716c]"
                }`}>
                  {cuenta.estado}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Fecha Emisión</span>
              <span className="font-medium text-white flex items-center gap-1">
                <Calendar size={12} className="text-[#adaaaa]" />
                {dateFormatter.format(new Date(cuenta.fecha_emision))}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Fecha Vencimiento</span>
              <span className="font-medium text-white flex items-center gap-1">
                <Calendar size={12} className="text-[#adaaaa]" />
                {dateFormatter.format(new Date(cuenta.fecha_vencimiento))}
              </span>
            </div>
            {cuenta.observacion && (
              <div className="flex flex-col gap-1 col-span-2 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
                <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Observación</span>
                <span className="text-[#adaaaa] text-xs italic leading-snug">{cuenta.observacion}</span>
              </div>
            )}
          </div>

          {/* Abonos Realizados Table */}
          <div className="flex flex-col gap-2">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] uppercase tracking-[0.5px] flex items-center gap-1.5">
              <DollarSign size={14} className="text-[#59ee50]" />
              Historial de Abonos / Cobros
            </span>

            {loading ? (
              <div className="text-center py-8 text-[#adaaaa] text-sm">Cargando cobros...</div>
            ) : error ? (
              <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.22)] rounded-lg p-3 text-[#ff716c] text-xs">
                {error}
              </div>
            ) : pagos.length === 0 ? (
              <div className="text-center py-8 text-[#adaaaa] text-xs italic bg-[#161616] rounded-xl border border-[rgba(72,72,71,0.1)] flex items-center justify-center gap-1">
                <Info size={12} />
                No se registran cobros a esta deuda.
              </div>
            ) : (
              <div className="border border-[rgba(72,72,71,0.15)] rounded-xl overflow-hidden bg-[#111]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#1a1a1a] text-[#adaaaa] uppercase tracking-[0.5px] border-b border-[rgba(72,72,71,0.15)]">
                      <th className="px-4 py-3">Fecha y Hora</th>
                      <th className="px-4 py-3 text-center">Método</th>
                      <th className="px-4 py-3">Notas</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => {
                      return (
                        <tr key={p.id} className="border-b border-[rgba(72,72,71,0.08)] last:border-b-0 hover:bg-[#151515]">
                          <td className="px-4 py-3 text-[#adaaaa]">
                            {dateTimeFormatter.format(new Date(p.fecha_pago))}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-[5px] bg-[#222] border border-[rgba(72,72,71,0.3)] text-white text-[9px] font-bold uppercase">
                              {p.metodo_pago}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#adaaaa] italic truncate max-w-[150px]">
                            {p.notas || "Sin notas"}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#59ee50]">
                            {RD(p.monto)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[rgba(72,72,71,0.18)] bg-[#171717] shrink-0 flex justify-between items-center">
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div className="flex flex-col">
              <span className="text-[#adaaaa] text-[9px] uppercase tracking-[0.8px]">Monto Total</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-base">
                {RD(cuenta.monto_total)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#adaaaa] text-[9px] uppercase tracking-[0.8px]">Cobrado</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-base">
                {RD(cuenta.monto_pagado)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#adaaaa] text-[9px] uppercase tracking-[0.8px]">Pendiente</span>
              <span className={`font-['Space_Grotesk',sans-serif] font-bold text-base ${balance > 0 ? "text-[#ff716c]" : "text-white"}`}>
                {RD(balance)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-[#262626] text-[#adaaaa] hover:bg-zinc-800 hover:text-white rounded-[10px] px-5 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
