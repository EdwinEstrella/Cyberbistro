import { useState, useEffect, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";

const ITBIS = 0.18;

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export interface MesaConsumoRow {
  id: string;
  mesa_numero: number | null;
  comanda_id: string | null;
  plato_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tipo: "cocina" | "directo";
  estado: "pedido" | "enviado_cocina" | "listo" | "entregado" | "pagado";
  factura_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MesaCloseAccountModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  mesaNumero: number;
  onSettled?: (remaining: MesaConsumoRow[]) => void | Promise<void>;
  /** Solo cuando la mesa queda sin consumos pendientes tras un cobro completo. */
  onPaidFull?: () => void;
}

async function loadTableConsumption(
  tenantId: string,
  mesaNumero: number
): Promise<MesaConsumoRow[]> {
  const { data, error } = await insforgeClient.database
    .from("consumos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("mesa_numero", mesaNumero)
    .neq("estado", "pagado")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as MesaConsumoRow[];
}

export function MesaCloseAccountModal({
  open,
  onClose,
  tenantId,
  mesaNumero,
  onSettled,
  onPaidFull,
}: MesaCloseAccountModalProps) {
  const [mesaConsumos, setMesaConsumos] = useState<MesaConsumoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [charging, setCharging] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "tarjeta" | "digital">(
    "efectivo"
  );
  const [splitMode, setSplitMode] = useState(false);
  const [selectedConsumos, setSelectedConsumos] = useState<Set<string>>(new Set());
  const [splitParts, setSplitParts] = useState(2);

  const refreshConsumos = useCallback(async () => {
    if (!tenantId) return [];
    return loadTableConsumption(tenantId, mesaNumero);
  }, [tenantId, mesaNumero]);

  useEffect(() => {
    if (!open) {
      setSplitMode(false);
      setSelectedConsumos(new Set());
      setPaymentMethod("efectivo");
      return;
    }
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    void loadTableConsumption(tenantId, mesaNumero).then((rows) => {
      if (!cancelled) {
        setMesaConsumos(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, mesaNumero]);

  async function printFactura(facturaId: string, numeroFactura: number) {
    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .select("*")
      .eq("id", facturaId)
      .single();

    if (facturaError || !factura) {
      console.error("Error al obtener factura:", facturaError);
      return;
    }

    const { data: tenant } = await insforgeClient.database
      .from("tenants")
      .select("nombre_negocio, rnc, direccion, telefono, logo_url")
      .eq("id", factura.tenant_id)
      .single();

    if (!tenant) {
      console.error("Error: No se encontró información del tenant");
      return;
    }

    const paperWidthMm = getThermalPrintSettings().paperWidthMm;
    const html = buildFacturaReceiptHtml(
      {
        nombre_negocio: tenant.nombre_negocio,
        rnc: tenant.rnc,
        direccion: tenant.direccion,
        telefono: tenant.telefono,
        logo_url: tenant.logo_url,
      },
      factura as unknown as Parameters<typeof buildFacturaReceiptHtml>[1],
      numeroFactura,
      paperWidthMm
    );

    const res = await printThermalHtml(html);
    if (!res.ok && res.error) {
      console.warn("Impresión factura:", res.error);
    }
  }

  function toggleConsumoSelection(consumoId: string) {
    setSelectedConsumos((prev) => {
      const next = new Set(prev);
      if (next.has(consumoId)) next.delete(consumoId);
      else next.add(consumoId);
      return next;
    });
  }

  function selectAllConsumos() {
    setSelectedConsumos(new Set(mesaConsumos.map((c) => c.id)));
  }

  function clearConsumoSelection() {
    setSelectedConsumos(new Set());
  }

  function splitConsumosEqually() {
    if (mesaConsumos.length === 0) return;
    const itemsPerPerson = Math.ceil(mesaConsumos.length / splitParts);
    const next = new Set<string>();
    mesaConsumos.forEach((consumo, index) => {
      if (index < itemsPerPerson) next.add(consumo.id);
    });
    setSelectedConsumos(next);
  }

  function calculateTotals() {
    const consumosToBill =
      splitMode && selectedConsumos.size > 0
        ? mesaConsumos.filter((c) => selectedConsumos.has(c.id))
        : mesaConsumos;

    const subtotal = consumosToBill.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * ITBIS;
    const total = subtotal + itbis;
    return { subtotal, itbis, total };
  }

  async function createPartialInvoice() {
    if (!tenantId) return;
    if (selectedConsumos.size === 0) {
      alert("Selecciona al menos un item para cobrar");
      return;
    }

    setCharging(true);

    const consumosToInvoice = mesaConsumos.filter((c) => selectedConsumos.has(c.id));

    const groupedItems = consumosToInvoice.reduce(
      (acc, consumo) => {
        const key = consumo.plato_id;
        if (!acc[key]) {
          acc[key] = {
            plato_id: consumo.plato_id,
            nombre: consumo.nombre,
            cantidad: 0,
            precio_unitario: consumo.precio_unitario,
            subtotal: 0,
          };
        }
        acc[key].cantidad += consumo.cantidad;
        acc[key].subtotal += consumo.subtotal;
        return acc;
      },
      {} as Record<number, { plato_id: number; nombre: string; cantidad: number; precio_unitario: number; subtotal: number }>
    );

    const facturaItems = Object.values(groupedItems);

    const subtotal = consumosToInvoice.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * ITBIS;
    const total = subtotal + itbis;

    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .insert([
        {
          tenant_id: tenantId,
          mesa_numero: mesaNumero,
          metodo_pago: paymentMethod,
          estado: "pagada",
          subtotal,
          itbis,
          propina: 0,
          total,
          items: facturaItems,
          notas: `Cuenta parcial (${selectedConsumos.size} items)`,
          pagada_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (facturaError || !factura) {
      console.error("Error al crear factura parcial:", facturaError);
      alert(`Error al procesar el pago: ${facturaError?.message || "Error desconocido"}`);
      setCharging(false);
      return;
    }

    await printFactura(factura.id, factura.numero_factura);

    const consumoIds = Array.from(selectedConsumos);
    const { error: updateError } = await insforgeClient.database
      .from("consumos")
      .update({
        estado: "pagado",
        factura_id: factura.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", consumoIds);

    if (updateError) {
      console.error("Error al marcar consumos como pagados:", updateError);
    }

    const clearedCount = consumoIds.length;
    setSelectedConsumos(new Set());

    const updatedConsumos = await refreshConsumos();
    setMesaConsumos(updatedConsumos);
    await onSettled?.(updatedConsumos);

    setCharging(false);

    if (updatedConsumos.length === 0) {
      setSplitMode(false);
      onPaidFull?.();
      onClose();
    } else {
      alert(
        `✅ Cuenta parcial cobrada (${clearedCount} items).\n\nQuedan ${updatedConsumos.length} items pendientes por cobrar.`
      );
    }
  }

  async function createInvoice() {
    if (!tenantId) return;
    if (mesaConsumos.length === 0) {
      alert("No hay consumos pendientes para cobrar");
      return;
    }

    setCharging(true);

    const consumosToBill = mesaConsumos;

    const groupedItems = consumosToBill.reduce(
      (acc, consumo) => {
        const key = consumo.plato_id;
        if (!acc[key]) {
          acc[key] = {
            plato_id: consumo.plato_id,
            nombre: consumo.nombre,
            cantidad: 0,
            precio_unitario: consumo.precio_unitario,
            subtotal: 0,
          };
        }
        acc[key].cantidad += consumo.cantidad;
        acc[key].subtotal += consumo.subtotal;
        return acc;
      },
      {} as Record<number, { plato_id: number; nombre: string; cantidad: number; precio_unitario: number; subtotal: number }>
    );

    const facturaItems = Object.values(groupedItems);

    const subtotal = consumosToBill.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * ITBIS;
    const total = subtotal + itbis;

    const facturaData: Record<string, unknown> = {
      tenant_id: tenantId,
      metodo_pago: paymentMethod,
      estado: "pagada",
      subtotal,
      itbis,
      propina: 0,
      total,
      items: facturaItems,
      pagada_at: new Date().toISOString(),
      mesa_numero: mesaNumero,
      notas: `Mesa ${mesaNumero}`,
    };

    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .insert([facturaData])
      .select()
      .single();

    if (facturaError || !factura) {
      console.error("Error al crear factura:", facturaError);
      alert(`Error al procesar el pago: ${facturaError?.message || "Error desconocido"}`);
      setCharging(false);
      return;
    }

    await printFactura(factura.id, factura.numero_factura);

    const consumoIds = consumosToBill.map((c) => c.id);
    const { error: updateError } = await insforgeClient.database
      .from("consumos")
      .update({
        estado: "pagado",
        factura_id: factura.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", consumoIds);

    if (updateError) {
      console.error("Error al marcar consumos como pagados:", updateError);
    }

    const restantes = await refreshConsumos();
    setMesaConsumos(restantes);
    await onSettled?.(restantes);

    setCharging(false);
    setSplitMode(false);
    setSelectedConsumos(new Set());
    onPaidFull?.();
    onClose();
  }

  if (!open) return null;

  const { subtotal: calcSubtotal, itbis: calcItbis, total: calcTotal } = calculateTotals();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-[28px] w-[700px] max-h-[90vh] overflow-y-auto flex flex-col gap-[20px] shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px]">
              Cobrar Mesa {mesaNumero}
            </span>
            {loading ? (
              <div className="text-[#adaaaa] text-[12px] mt-1">Cargando cuenta…</div>
            ) : mesaConsumos.length > 0 ? (
              <div className="text-[#adaaaa] text-[12px] mt-1">
                {mesaConsumos.length} items pendientes
              </div>
            ) : (
              <div className="text-[#adaaaa] text-[12px] mt-1">Sin líneas pendientes</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
            }}
            className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[20px] hover:text-white transition-colors leading-none"
          >
            ×
          </button>
        </div>

        {mesaConsumos.length > 1 && (
          <div className="flex items-center justify-between bg-[#262626] rounded-[12px] p-[12px]">
            <div className="flex items-center gap-[8px]">
              <span className="text-white text-[14px]">🔄</span>
              <span className="font-['Inter',sans-serif] text-white text-[13px]">Dividir cuenta</span>
              <span className="text-[#adaaaa] text-[11px]">(solo si el cliente lo solicita)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSplitMode(!splitMode);
                if (!splitMode) setSelectedConsumos(new Set());
              }}
              className={`px-4 py-2 rounded-[8px] font-['Inter',sans-serif] font-bold text-[12px] transition-all ${
                splitMode ? "bg-[#ff906d] text-[#5b1600]" : "bg-[#383838] text-[#adaaaa]"
              }`}
            >
              {splitMode ? "Activado" : "Activar"}
            </button>
          </div>
        )}

        {splitMode && mesaConsumos.length > 0 && (
          <div className="bg-[#262626] rounded-[12px] p-[12px] flex flex-col gap-[12px]">
            <div className="flex items-center justify-between">
              <span className="font-['Inter',sans-serif] text-white text-[13px]">
                Selecciona items que va a pagar esta persona
              </span>
              <div className="flex gap-[8px]">
                <button
                  type="button"
                  onClick={selectAllConsumos}
                  className="px-3 py-1 bg-[#383838] hover:bg-[#444] text-white text-[11px] rounded-[6px] transition-colors"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={clearConsumoSelection}
                  className="px-3 py-1 bg-[#383838] hover:bg-[#444] text-white text-[11px] rounded-[6px] transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="flex items-center gap-[12px] flex-wrap">
              <span className="text-[#adaaaa] text-[12px]">Dividir entre:</span>
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => setSplitParts((p) => Math.max(2, p - 1))}
                  className="w-[32px] h-[32px] bg-[#383838] hover:bg-[#444] text-white rounded-[8px] flex items-center justify-center font-bold text-[14px] transition-colors"
                >
                  −
                </button>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] min-w-[40px] text-center">
                  {splitParts}
                </span>
                <button
                  type="button"
                  onClick={() => setSplitParts((p) => Math.min(12, p + 1))}
                  className="w-[32px] h-[32px] bg-[#383838] hover:bg-[#444] text-white rounded-[8px] flex items-center justify-center font-bold text-[14px] transition-colors"
                >
                  +
                </button>
                <span className="text-[#adaaaa] text-[12px]">personas</span>
              </div>
              <button
                type="button"
                onClick={splitConsumosEqually}
                className="ml-auto px-4 py-2 bg-[#59ee50] hover:bg-[#4cd444] text-[#0e0e0e] text-[12px] font-bold rounded-[8px] transition-colors"
              >
                Dividir equitativamente
              </button>
            </div>
          </div>
        )}

        {splitMode && mesaConsumos.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto flex flex-col gap-[6px]">
            {mesaConsumos.map((consumo) => {
              const isSelected = selectedConsumos.has(consumo.id);
              return (
                <button
                  type="button"
                  key={consumo.id}
                  onClick={() => toggleConsumoSelection(consumo.id)}
                  className={`rounded-[8px] p-[10px] flex items-center justify-between transition-all cursor-pointer text-left w-full border-none ${
                    isSelected
                      ? "bg-[#ff906d]/20 border-2 border-[#ff906d]"
                      : "bg-[#262626] border-2 border-transparent hover:border-[rgba(255,144,109,0.3)]"
                  }`}
                >
                  <div className="flex items-center gap-[10px]">
                    <div
                      className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all shrink-0 ${
                        isSelected ? "bg-[#ff906d] border-[#ff906d]" : "border-[#6b7280]"
                      }`}
                    >
                      {isSelected && <span className="text-[#5b1600] text-[12px] font-bold">✓</span>}
                    </div>
                    <div>
                      <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px]">
                        {consumo.cantidad}× {consumo.nombre}
                      </div>
                      <div className="text-[#adaaaa] text-[11px]">
                        RD$ {Number(consumo.precio_unitario).toFixed(2)} c/u
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
                      RD$ {Number(consumo.subtotal).toFixed(2)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="bg-[#131313] rounded-[12px] p-[14px] flex flex-col gap-[8px]">
          {splitMode && selectedConsumos.size > 0 && (
            <>
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                  Seleccionado ({selectedConsumos.size} items)
                </span>
                <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                  {RD(
                    mesaConsumos
                      .filter((c) => selectedConsumos.has(c.id))
                      .reduce((sum, c) => sum + Number(c.subtotal), 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                  Restante ({mesaConsumos.length - selectedConsumos.size} items)
                </span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                  {RD(
                    mesaConsumos
                      .filter((c) => !selectedConsumos.has(c.id))
                      .reduce((sum, c) => sum + Number(c.subtotal), 0)
                  )}
                </span>
              </div>
              <div className="border-t border-[rgba(72,72,71,0.3)] my-[4px]" />
            </>
          )}

          <div className="flex justify-between">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">Subtotal</span>
            <span className="font-['Inter',sans-serif] text-white text-[11px]">{RD(calcSubtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">ITBIS (18%)</span>
            <span className="font-['Inter',sans-serif] text-white text-[11px]">{RD(calcItbis)}</span>
          </div>
          <div className="border-t border-[rgba(72,72,71,0.15)] pt-[6px] flex justify-between">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px]">
              {splitMode && selectedConsumos.size > 0 ? "TOTAL PARCIAL" : "TOTAL"}
            </span>
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
              {RD(calcTotal)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-[12px]">
          <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
            Método de pago
          </span>
          <div className="grid grid-cols-3 gap-[8px]">
            {(
              [
                { value: "efectivo" as const, label: "Efectivo", icon: "💵" },
                { value: "tarjeta" as const, label: "Tarjeta", icon: "💳" },
                { value: "digital" as const, label: "Digital", icon: "📱" },
              ] as const
            ).map((method) => (
              <button
                type="button"
                key={method.value}
                onClick={() => setPaymentMethod(method.value)}
                className={`flex flex-col items-center gap-[8px] py-[12px] rounded-[12px] cursor-pointer border-none transition-all ${
                  paymentMethod === method.value
                    ? "bg-[#ff906d] text-[#5b1600]"
                    : "bg-[#262626] text-white hover:bg-[#333]"
                }`}
              >
                <span className="text-[20px]">{method.icon}</span>
                <span className="font-['Inter',sans-serif] font-bold text-[10px] uppercase">
                  {method.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-[10px]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-[rgba(255,144,109,0.3)] hover:text-white transition-colors"
          >
            Cancelar
          </button>

          {splitMode && selectedConsumos.size > 0 ? (
            <button
              type="button"
              onClick={() => void createPartialInvoice()}
              disabled={charging || loading}
              className="flex-1 bg-[#ff906d] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff784d] transition-opacity"
            >
              {charging ? "Procesando..." : `Cobrar ${selectedConsumos.size} items`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void createInvoice()}
              disabled={charging || loading || mesaConsumos.length === 0}
              className="flex-1 bg-[#59ee50] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#0e0e0e] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 transition-opacity"
            >
              {charging ? "Procesando..." : "Confirmar Pago"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
