import { useState, useEffect } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";

interface MesaConPedido {
  id: number;
  numero: number;
  items: ItemEntrega[];
  total: number;
  pagada: boolean;
  factura_id?: string;
  created_at: string;
}

interface ItemEntrega {
  plato_id: number;
  nombre: string;
  cantidad: number;
  cantidad_entregada: number;
  precio_unitario: number;
  subtotal: number;
  va_a_cocina: boolean;
  comanda_estado?: string;
}

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function Entregas() {
  const [mesasConPedido, setMesasConPedido] = useState<MesaConPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendientes" | "completos">("todos");

  useEffect(() => {
    loadEntregas();
    // Recargar cada 30 segundos
    const interval = setInterval(loadEntregas, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadEntregas() {
    setLoading(true);

    // Obtener facturas recientes (últimas 24 horas) que tengan items
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: facturas, error } = await insforgeClient.database
      .from("facturas")
      .select("*")
      .gte("created_at", hace24h)
      .order("created_at", { ascending: false });

    if (error || !facturas) {
      setLoading(false);
      return;
    }

    // Obtener información de platos para saber cuáles van a cocina
    const { data: platos } = await insforgeClient.database
      .from("platos")
      .select("id, va_a_cocina")
      .in("id", [...new Set(facturas.flatMap((f: any) => f.items.map((i: any) => i.plato_id)))]);

    const platoMap = new Map(platos?.map((p: any) => [p.id, p.va_a_cocina]) || []);

    // Obtener comandas activas para saber el estado de los items de cocina
    const { data: comandas } = await insforgeClient.database
      .from("comandas")
      .select("*")
      .in("estado", ["pendiente", "en_preparacion", "listo"]);

    // Agrupar items por mesa
    const mesasMap = new Map<number, MesaConPedido>();

    for (const factura of facturas as any[]) {
      const mesaId = factura.mesa_id;

      if (!mesasMap.has(mesaId)) {
        mesasMap.set(mesaId, {
          id: mesaId,
          numero: factura.mesa_numero,
          items: [],
          total: 0,
          pagada: factura.estado === "pagada",
          factura_id: factura.id,
          created_at: factura.created_at,
        });
      }

      const mesa = mesasMap.get(mesaId)!;

      for (const item of factura.items) {
        const vaACocina = platoMap.get(item.plato_id) !== false;
        const comanda = comandas?.find((c: any) =>
          c.mesa_id === mesaId &&
          c.items.some((i: any) => i.nombre === item.nombre && i.cantidad === item.cantidad)
        );

        mesa.items.push({
          plato_id: item.plato_id,
          nombre: item.nombre,
          cantidad: item.cantidad,
          cantidad_entregada: 0, // TODO: Guardar en BD
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
          va_a_cocina: vaACocina,
          comanda_estado: comanda?.estado,
        });

        mesa.total += item.subtotal;
      }
    }

    const mesas = Array.from(mesasMap.values());
    setMesasConPedido(mesas);
    setLoading(false);
  }

  async function marcarEntregado(mesaId: number, platoId: number, cantidad: number) {
    // TODO: Implementar tracking de entregas en BD
    // Por ahora solo actualizamos estado local
    setMesasConPedido((prev) =>
      prev.map((mesa) =>
        mesa.id === mesaId
          ? {
              ...mesa,
              items: mesa.items.map((item) =>
                item.plato_id === platoId
                  ? { ...item, cantidad_entregada: Math.min(item.cantidad_entregada + cantidad, item.cantidad) }
                  : item
              ),
            }
          : mesa
      )
    );
  }

  function todosEntregados(mesa: MesaConPedido): boolean {
    return mesa.items.every(
      (item) => item.cantidad_entregada >= item.cantidad || !item.va_a_cocina
    );
  }

  function progresoEntrega(mesa: MesaConPedido): number {
    const itemsCocina = mesa.items.filter((i) => i.va_a_cocina);
    if (itemsCocina.length === 0) return 100;

    const total = itemsCocina.reduce((sum, i) => sum + i.cantidad, 0);
    const entregado = itemsCocina.reduce((sum, i) => sum + i.cantidad_entregada, 0);

    return total > 0 ? (entregado / total) * 100 : 0;
  }

  const mesasFiltradas = mesasConPedido.filter((mesa) => {
    if (filtroEstado === "pendientes") return !todosEntregados(mesa);
    if (filtroEstado === "completos") return todosEntregados(mesa);
    return true;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] py-[14px] sm:py-[20px] gap-[12px] border-b border-[rgba(72,72,71,0.2)]">
        <div className="flex items-center gap-[16px]">
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
            Entregas
          </h1>
          <div
            className="flex gap-[6px] items-center px-[12px] py-[4px] rounded-full"
            style={{
              backgroundColor: "rgba(255,144,109,0.1)",
            }}
          >
            <div
              className="rounded-full size-[8px]"
              style={{ backgroundColor: "#ff906d" }}
            />
            <span
              className="font-['Space_Grotesk',sans-serif] text-[10px] tracking-[0.5px] uppercase font-bold"
              style={{ color: "#ff906d" }}
            >
              Pedidos Activos
            </span>
          </div>
        </div>

        <div className="flex gap-[8px]">
          <button
            onClick={() => setFiltroEstado("todos")}
            className={`px-[16px] py-[8px] rounded-[8px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all ${
              filtroEstado === "todos"
                ? "bg-[#ff906d] text-[#5b1600]"
                : "bg-[#262626] text-[#adaaaa]"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltroEstado("pendientes")}
            className={`px-[16px] py-[8px] rounded-[8px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all ${
              filtroEstado === "pendientes"
                ? "bg-[#ff906d] text-[#5b1600]"
                : "bg-[#262626] text-[#adaaaa]"
            }`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setFiltroEstado("completos")}
            className={`px-[16px] py-[8px] rounded-[8px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all ${
              filtroEstado === "completos"
                ? "bg-[#ff906d] text-[#5b1600]"
                : "bg-[#262626] text-[#adaaaa]"
            }`}
          >
            Completos
          </button>
          <button
            onClick={loadEntregas}
            className="bg-[#262626] rounded-[8px] border border-[rgba(72,72,71,0.2)] flex gap-[8px] items-center px-[16px] py-[8px] cursor-pointer hover:border-[rgba(255,144,109,0.3)] transition-colors"
          >
            <span className="font-['Inter',sans-serif] text-white text-[12px]">↻</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
            Cargando entregas...
          </span>
        </div>
      ) : mesasFiltradas.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[14px]">
              No hay pedidos activos
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-[32px] py-[24px]">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[20px]">
            {mesasFiltradas.map((mesa) => {
              const progreso = progresoEntrega(mesa);
              const completo = todosEntregados(mesa);

              return (
                <div
                  key={mesa.id}
                  className="bg-[#1a1a1a] rounded-[16px] border border-[rgba(72,72,71,0.2)] overflow-hidden"
                >
                  {/* Header */}
                  <div className="px-[20px] py-[16px] border-b border-[rgba(72,72,71,0.15)] flex items-center justify-between">
                    <div className="flex items-center gap-[12px]">
                      <div className="rounded-[8px] flex items-center justify-center h-[36px] px-[12px] bg-[rgba(255,144,109,0.1)]">
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-[16px]" style={{ color: "#ff906d" }}>
                          {String(mesa.numero).padStart(2, "0")}
                        </span>
                      </div>
                      <div>
                        <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px]">
                          Mesa {mesa.numero}
                        </div>
                        <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                          {mesa.items.length} productos
                        </div>
                      </div>
                    </div>

                    <div
                      className={`px-[10px] py-[4px] rounded-full flex items-center gap-[6px] ${
                        completo ? "bg-[rgba(89,238,80,0.1)]" : "bg-[rgba(255,144,109,0.1)]"
                      }`}
                    >
                      <div
                        className="rounded-full size-[6px]"
                        style={{ backgroundColor: completo ? "#59ee50" : "#ff906d" }}
                      />
                      <span
                        className="font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase"
                        style={{ color: completo ? "#59ee50" : "#ff906d" }}
                      >
                        {completo ? "Completo" : "Pendiente"}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-[16px] flex flex-col gap-[8px] max-h-[240px] overflow-y-auto">
                    {mesa.items.map((item, idx) => {
                      const entregado = item.cantidad_entregada >= item.cantidad;
                      const queda = item.cantidad - item.cantidad_entregada;

                      return (
                        <div
                          key={idx}
                          className={`rounded-[10px] p-[12px] border ${
                            entregado
                              ? "bg-[rgba(89,238,80,0.05)] border-[rgba(89,238,80,0.15)]"
                              : "bg-[rgba(255,144,109,0.05)] border-[rgba(255,144,109,0.15)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-[8px]">
                            <div className="flex-1">
                              <div className="flex items-center gap-[8px]">
                                <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[13px] uppercase ${
                                  entregado ? "text-[#59ee50]" : "text-white"
                                }`}>
                                  {item.nombre}
                                </span>

                                {item.va_a_cocina && item.comanda_estado && (
                                  <span className="px-[6px] py-[2px] rounded-[4px] font-['Inter',sans-serif] font-bold text-[8px] uppercase tracking-[0.5px]" style={{
                                    backgroundColor: item.comanda_estado === "listo"
                                      ? "rgba(89,238,80,0.15)"
                                      : item.comanda_estado === "en_preparacion"
                                      ? "rgba(255,208,109,0.15)"
                                      : "rgba(255,144,109,0.15)",
                                    color: item.comanda_estado === "listo"
                                      ? "#59ee50"
                                      : item.comanda_estado === "en_preparacion"
                                      ? "#ffd06d"
                                      : "#ff906d",
                                  }}>
                                    {item.comanda_estado === "listo"
                                      ? "Listo"
                                      : item.comanda_estado === "en_preparacion"
                                      ? "Preparando"
                                      : "Pendiente"}
                                  </span>
                                )}

                                {item.va_a_cocina === false && (
                                  <span className="px-[6px] py-[2px] rounded-[4px] bg-[rgba(89,238,80,0.1)] font-['Inter',sans-serif] font-bold text-[8px] uppercase tracking-[0.5px] text-[#59ee50]">
                                    Directo
                                  </span>
                                )}
                              </div>

                              <div className="mt-[6px] flex items-center gap-[12px]">
                                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">
                                  {item.cantidad} × {RD(item.precio_unitario)}
                                </span>
                                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[14px]" style={{ color: entregado ? "#59ee50" : "#ff906d" }}>
                                  {RD(item.subtotal)}
                                </span>
                              </div>

                              {queda > 0 && (
                                <div className="mt-[6px] text-[#ff906d]">
                                  <span className="font-['Inter',sans-serif] text-[11px]">
                                    {queda > 1 ? `Quedan ${queda} por entregar` : `Queda ${queda} por entregar`}
                                  </span>
                                </div>
                              )}
                            </div>

                            {item.va_a_cocina && queda > 0 && (
                              <button
                                onClick={() => marcarEntregado(mesa.id, item.plato_id, queda)}
                                className="shrink-0 bg-[#59ee50] rounded-[8px] px-[10px] py-[6px] font-['Inter',sans-serif] font-bold text-[10px] uppercase text-[#0e0e0e] cursor-pointer border-none hover:bg-[#4ade4f] transition-colors"
                              >
                                Entregar {queda}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Progreso */}
                  {mesa.items.some((i) => i.va_a_cocina) && (
                    <div className="px-[16px] pb-[16px]">
                      <div className="flex items-center justify-between mb-[6px]">
                        <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] uppercase tracking-[0.5px]">
                          Progreso de entrega
                        </span>
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-[11px]" style={{ color: completo ? "#59ee50" : "#ff906d" }}>
                          {Math.round(progreso)}%
                        </span>
                      </div>
                      <div className="h-[6px] bg-[#131313] rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${progreso}%`,
                            backgroundColor: completo ? "#59ee50" : "#ff906d",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-[16px] py-[12px] border-t border-[rgba(72,72,71,0.15)] bg-[rgba(38,38,38,0.3)] flex items-center justify-between">
                    <div className="flex flex-col gap-[2px]">
                      <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">
                        Total cuenta
                      </span>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[16px]" style={{ color: "#ff906d" }}>
                        {RD(mesa.total)}
                      </span>
                    </div>

                    {mesa.pagada && (
                      <div className="flex items-center gap-[6px] px-[10px] py-[4px] rounded-full bg-[rgba(89,238,80,0.1)]">
                        <div className="rounded-full size-[5px]" style={{ backgroundColor: "#59ee50" }} />
                        <span className="font-['Inter',sans-serif] font-bold text-[10px] uppercase tracking-[0.5px] text-[#59ee50]">
                          Pagada
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}