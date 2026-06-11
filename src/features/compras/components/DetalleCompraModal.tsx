import { useEffect, useState } from "react";
import { X, Receipt } from "lucide-react";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { insforgeClient } from "../../../shared/lib/insforge";
import type { CompraRow, ProveedorRow, ProductoRow } from "./Compras";

interface CompraDetalleRow {
  id: string;
  compra_id: string;
  producto_id: string;
  cantidad: number;
  costo_unitario: number;
  total: number;
}

interface DetalleCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  compra: CompraRow | null;
  proveedor: ProveedorRow | null;
  productos: ProductoRow[];
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

export function DetalleCompraModal({
  isOpen,
  onClose,
  tenantId,
  compra,
  proveedor,
  productos,
}: DetalleCompraModalProps) {
  const [detalles, setDetalles] = useState<CompraDetalleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !tenantId || !compra) return;

    const currentTenantId = tenantId;
    const currentCompra = compra;

    async function loadDetalles() {
      setLoading(true);
      setError("");
      try {
        const useLocal = await shouldReadLocalFirst(currentTenantId, ["compra_detalles"]);
        let data: CompraDetalleRow[] = [];

        if (useLocal) {
          const allDetalles = await readLocalMirror<CompraDetalleRow>(currentTenantId, "compra_detalles");
          data = allDetalles.filter(d => d.compra_id === currentCompra.id);
        } else {
          const res = await insforgeClient.database
            .from("compra_detalles")
            .select("*")
            .eq("compra_id", currentCompra.id);
          if (res.error) throw res.error;
          data = res.data || [];
        }

        setDetalles(data);
      } catch (err: any) {
        setError(err.message || "Error al cargar detalles de la compra.");
      } finally {
        setLoading(false);
      }
    }

    void loadDetalles();
  }, [isOpen, tenantId, compra]);

  if (!isOpen || !compra) return null;

  const productosMap = new Map(productos.map(p => [p.id, p]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_30px_rgba(255,144,109,0.15)] max-w-[640px] w-full max-h-[85vh] flex flex-col text-white overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-[rgba(72,72,71,0.18)] shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-[#ff906d]" />
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase tracking-[0.5px]">
              Detalle de Compra
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
            <div className="flex flex-col gap-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Factura / Comprobante</span>
              <span className="font-mono font-bold text-white text-base">
                {compra.numero_factura || "S/N"}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Fecha de Compra</span>
              <span className="font-medium text-white">
                {dateFormatter.format(new Date(compra.fecha_compra))}
              </span>
            </div>
            <div className="flex flex-col gap-1 col-span-2 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Proveedor</span>
              <span className="font-bold text-white text-base">
                {proveedor?.nombre || "Proveedor Desconocido"}
              </span>
              {proveedor?.rnc && (
                <span className="text-[#adaaaa] text-xs">RNC: {proveedor.rnc}</span>
              )}
            </div>
            <div className="flex flex-col gap-1 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Condición de Pago</span>
              <span className="capitalize font-semibold text-[#ff906d]">{compra.tipo_pago}</span>
            </div>
            <div className="flex flex-col gap-1 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
              <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Método de Pago</span>
              <span className="capitalize text-white">{compra.metodo_pago || "N/A"}</span>
            </div>
            {compra.observacion && (
              <div className="flex flex-col gap-1 col-span-2 border-t border-[rgba(72,72,71,0.1)] pt-2 mt-1">
                <span className="text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">Observación</span>
                <span className="text-[#adaaaa] text-xs italic leading-snug">{compra.observacion}</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="flex flex-col gap-2">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] uppercase tracking-[0.5px]">
              Artículos Comprados
            </span>

            {loading ? (
              <div className="text-center py-8 text-[#adaaaa] text-sm">Cargando artículos...</div>
            ) : error ? (
              <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.22)] rounded-lg p-3 text-[#ff716c] text-xs">
                {error}
              </div>
            ) : detalles.length === 0 ? (
              <div className="text-center py-8 text-[#adaaaa] text-xs italic">
                No hay artículos registrados en esta compra.
              </div>
            ) : (
              <div className="border border-[rgba(72,72,71,0.15)] rounded-xl overflow-hidden bg-[#111]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#1a1a1a] text-[#adaaaa] uppercase tracking-[0.5px] border-b border-[rgba(72,72,71,0.15)]">
                      <th className="px-4 py-3">Insumo / Artículo</th>
                      <th className="px-4 py-3 text-center">Cant.</th>
                      <th className="px-4 py-3 text-right">Costo U.</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalles.map((d) => {
                      const prod = productosMap.get(d.producto_id);
                      return (
                        <tr key={d.id} className="border-b border-[rgba(72,72,71,0.08)] last:border-b-0 hover:bg-[#151515]">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-white block">
                              {prod?.nombre || "Producto Desconocido"}
                            </span>
                            <span className="text-[10px] text-[#6b7280]">
                              Unidad: {prod?.unidad_base || "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-white">
                            {d.cantidad}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[#adaaaa]">
                            {RD(d.costo_unitario)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-white">
                            {RD(d.total)}
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
          <div className="flex flex-col">
            <span className="text-[#adaaaa] text-[9px] uppercase tracking-[0.8px]">Total de la Factura</span>
            <span className="font-['Space_Grotesk',sans-serif] font-black text-[#ff906d] text-xl">
              {RD(compra.total)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="bg-[#262626] text-[#adaaaa] hover:bg-zinc-800 hover:text-white rounded-[10px] px-5 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-colors"
          >
            Cerrar Detalles
          </button>
        </div>
      </div>
    </div>
  );
}
