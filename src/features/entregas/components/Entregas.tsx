import { useState, useEffect, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";

interface MesaConPedido {
  /** Agrupa por mesa (`mesa-2`, `mesa-0` para llevar) — cuenta abierta, no factura */
  id: string;
  numero: number;
  items: ItemEntrega[];
  total: number;
  pagada: boolean;
  created_at: string;
}

interface ItemEntrega {
  consumo_id: string;
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
  const { tenantId, loading: authLoading } = useAuth();
  const [mesasConPedido, setMesasConPedido] = useState<MesaConPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "falta_entregar" | "listo_cobro">("todos");

  const loadEntregas = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true;
      if (!tenantId) {
        setMesasConPedido([]);
        if (!soft) setLoading(false);
        return;
      }

      if (!soft) setLoading(true);

      const { data: consumos, error } = await insforgeClient.database
        .from("consumos")
        .select("*")
        .eq("tenant_id", tenantId)
        .neq("estado", "pagado")
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        setMesasConPedido([]);
        if (!soft) setLoading(false);
        return;
      }

      if (!consumos?.length) {
        setMesasConPedido([]);
        if (!soft) setLoading(false);
        return;
      }

      const platoIds = [...new Set((consumos as { plato_id: number }[]).map((c) => c.plato_id))];
      const { data: platos } =
        platoIds.length > 0
          ? await insforgeClient.database.from("platos").select("id, va_a_cocina").in("id", platoIds)
          : { data: [] as { id: number; va_a_cocina: boolean }[] };

      const platoMap = new Map((platos ?? []).map((p) => [p.id, p.va_a_cocina]));

      const comandaIds = [
        ...new Set(
          (consumos as { comanda_id: string | null }[])
            .map((c) => c.comanda_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const { data: comandasRows } =
        comandaIds.length > 0
          ? await insforgeClient.database.from("comandas").select("id, estado").in("id", comandaIds)
          : { data: [] as { id: string; estado: string }[] };

      const comandaEstadoById = new Map((comandasRows ?? []).map((c) => [c.id, c.estado]));

      const mesasMap = new Map<string, MesaConPedido>();

      for (const row of consumos as {
        id: string;
        mesa_numero: number | null;
        plato_id: number;
        nombre: string;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
        tipo: string;
        estado: string;
        comanda_id: string | null;
        created_at: string;
      }[]) {
        const num = Number(row.mesa_numero) || 0;
        const groupKey = `mesa-${num}`;

        if (!mesasMap.has(groupKey)) {
          mesasMap.set(groupKey, {
            id: groupKey,
            numero: num,
            items: [],
            total: 0,
            pagada: false,
            created_at: row.created_at,
          });
        }

        const mesa = mesasMap.get(groupKey)!;
        if (row.created_at > mesa.created_at) mesa.created_at = row.created_at;

        const vaACocina =
          row.tipo === "cocina" && platoMap.get(row.plato_id) !== false;
        const lineaEntregada = !vaACocina || row.estado === "entregado";
        const cantidad_entregada = lineaEntregada ? row.cantidad : 0;
        const comanda_estado = row.comanda_id ? comandaEstadoById.get(row.comanda_id) : undefined;

        mesa.items.push({
          consumo_id: row.id,
          plato_id: row.plato_id,
          nombre: row.nombre,
          cantidad: row.cantidad,
          cantidad_entregada,
          precio_unitario: Number(row.precio_unitario),
          subtotal: Number(row.subtotal),
          va_a_cocina: vaACocina,
          comanda_estado,
        });

        mesa.total += Number(row.subtotal);
      }

      const mesas = Array.from(mesasMap.values()).sort((a, b) => {
        if (a.numero === 0 && b.numero !== 0) return 1;
        if (b.numero === 0 && a.numero !== 0) return -1;
        return a.numero - b.numero;
      });

      setMesasConPedido(mesas);
      if (!soft) setLoading(false);
    },
    [tenantId]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) {
      setMesasConPedido([]);
      setLoading(false);
      return;
    }
    void loadEntregas();
    const interval = setInterval(() => loadEntregas({ soft: true }), 30000);
    return () => clearInterval(interval);
  }, [authLoading, tenantId, loadEntregas]);

  /** Marca el consumo como entregado en mesa (cuenta abierta; al cobrar pasa a pagado). */
  async function marcarEntregado(consumoId: string) {
    if (!tenantId) return;
    const { error: upErr } = await insforgeClient.database
      .from("consumos")
      .update({ estado: "entregado", updated_at: new Date().toISOString() })
      .eq("id", consumoId)
      .eq("tenant_id", tenantId);

    if (upErr) {
      console.error(upErr);
      alert(`No se pudo guardar la entrega: ${upErr.message}`);
      return;
    }

    await loadEntregas({ soft: true });
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
    if (filtroEstado === "falta_entregar") return !todosEntregados(mesa);
    if (filtroEstado === "listo_cobro") return todosEntregados(mesa);
    return true;
  });

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando sesión...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] text-center max-w-md">
          Tu usuario no está vinculado a un negocio. Las entregas se filtran por restaurante
          (multitenant).
        </p>
      </div>
    );
  }

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
              Cuentas abiertas
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-[8px]">
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
            onClick={() => setFiltroEstado("falta_entregar")}
            className={`px-[16px] py-[8px] rounded-[8px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all ${
              filtroEstado === "falta_entregar"
                ? "bg-[#ff906d] text-[#5b1600]"
                : "bg-[#262626] text-[#adaaaa]"
            }`}
          >
            Falta entregar
          </button>
          <button
            onClick={() => setFiltroEstado("listo_cobro")}
            className={`px-[16px] py-[8px] rounded-[8px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all ${
              filtroEstado === "listo_cobro"
                ? "bg-[#ff906d] text-[#5b1600]"
                : "bg-[#262626] text-[#adaaaa]"
            }`}
          >
            Listo p/ cobro
          </button>
          <button
            type="button"
            onClick={() => loadEntregas()}
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
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[14px] block">
              {mesasConPedido.length === 0
                ? "No hay cuentas abiertas en el POS."
                : filtroEstado === "falta_entregar"
                  ? "Ninguna mesa con entrega pendiente. Probá «Todos» o «Listo p/ cobro»."
                  : filtroEstado === "listo_cobro"
                    ? "Ninguna mesa con entrega completa aún. Usá «Todos» o «Falta entregar»."
                    : "No hay resultados para este filtro."}
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
                          {mesa.numero !== 0 ? String(mesa.numero).padStart(2, "0") : "PL"}
                        </span>
                      </div>
                      <div>
                        <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px]">
                          {mesa.numero !== 0 ? `Mesa ${mesa.numero}` : "Para llevar"}
                        </div>
                        <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                          {mesa.items.length} productos
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-[4px]">
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
                          {completo ? "Entrega lista" : "Falta entregar"}
                        </span>
                      </div>
                      {completo ? (
                        <span className="font-['Inter',sans-serif] text-[9px] text-[#ffd06d] tracking-wide uppercase font-bold text-right max-w-[9rem] leading-tight">
                          Cuenta abierta → cobrar en POS
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-[16px] flex flex-col gap-[8px] max-h-[240px] overflow-y-auto">
                    {mesa.items.map((item) => {
                      const entregado =
                        !item.va_a_cocina || item.cantidad_entregada >= item.cantidad;
                      const queda = item.va_a_cocina
                        ? Math.max(0, item.cantidad - item.cantidad_entregada)
                        : 0;

                      return (
                        <div
                          key={item.consumo_id}
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
                                onClick={() => marcarEntregado(item.consumo_id)}
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
                  <div className="px-[16px] py-[12px] border-t border-[rgba(72,72,71,0.15)] bg-[rgba(38,38,38,0.3)] flex items-center justify-between gap-[12px]">
                    <div className="flex flex-col gap-[2px]">
                      <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.5px]">
                        Total cuenta (sin facturar)
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