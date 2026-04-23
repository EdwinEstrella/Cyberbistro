import { useState, useEffect, useMemo, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { MESAS_CONFIG } from "../config/mesas";
import { estadoColors, estadoLabels, type MesaEstadoVisual } from "../config/estadoTheme";
import { MesaCloseAccountModal } from "../../billing/components/MesaCloseAccountModal";
import { TableMesaCard } from "./TableMesaCard";
import { DEFAULT_NCF_B_CODE, type NcfBCode } from "../../../shared/lib/ncf";
import { loadTenantBillingSettings } from "../../../shared/lib/tenantBillingSettings";

type Estado = MesaEstadoVisual;

interface MesaEstadoDB {
  id: number;
  estado: Estado;
  fusionada: boolean;
  fusion_padre_id: number | null;
  fusion_hijos: number[];
  span_filas: number;
  span_columnas: number;
}

type MesaConfig = (typeof MESAS_CONFIG)[number];

interface Mesa extends MesaConfig {
  estado: Estado;
  fusionada: boolean;
  fusion_padre_id: number | null;
  fusion_hijos: number[];
  span_filas: number;
  span_columnas: number;
}

function getAdjacentMesas(mesa: Mesa, allMesas: Mesa[]): Mesa[] {
  const visible = allMesas.filter((m) => !m.fusionada && m.id !== mesa.id);
  return visible.filter((m) => {
    const rightOf =
      m.fila === mesa.fila &&
      m.columna === mesa.columna + mesa.span_columnas &&
      m.span_filas === mesa.span_filas;
    const leftOf =
      m.fila === mesa.fila &&
      m.columna + m.span_columnas === mesa.columna &&
      m.span_filas === mesa.span_filas;
    const below =
      m.columna === mesa.columna &&
      m.fila === mesa.fila + mesa.span_filas &&
      m.span_columnas === mesa.span_columnas;
    const above =
      m.columna === mesa.columna &&
      m.fila + m.span_filas === mesa.fila &&
      m.span_columnas === mesa.span_columnas;
    return rightOf || leftOf || below || above;
  });
}

const ITBIS = 0.18;

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function etiquetaEstadoConsumo(estado: string): string {
  switch (estado) {
    case "enviado_cocina":
      return "En cocina / barra";
    case "listo":
      return "Listo para servir";
    case "entregado":
      return "Entregado en mesa";
    case "pedido":
      return "Pedido";
    default:
      return estado;
  }
}

function etiquetaEstadoComanda(estado: string | undefined): string | null {
  if (!estado) return null;
  switch (estado) {
    case "pendiente":
      return "Cocina: pendiente";
    case "en_preparacion":
      return "Cocina: preparando";
    case "listo":
      return "Cocina: listo";
    case "entregado":
      return "Cocina: comanda cerrada";
    default:
      return null;
  }
}

interface ConsumoPanelRow {
  id: string;
  nombre: string;
  cantidad: number;
  subtotal: number;
  precio_unitario: number;
  estado: string;
  tipo: string;
  created_at: string;
  comanda_id: string | null;
}

export function Tables() {
  const { tenantId, loading: authLoading } = useAuth();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  /** Deuda real = consumos no pagados (misma fuente que el historial del panel). */
  const [deudaPorMesa, setDeudaPorMesa] = useState<Record<number, number>>({});
  const [historialConsumos, setHistorialConsumos] = useState<ConsumoPanelRow[]>([]);
  const [comandaEstados, setComandaEstados] = useState<Record<string, string>>({});
  const [showCloseAccountModal, setShowCloseAccountModal] = useState(false);
  /** Cobro desde Mesas: por defecto sin ITBIS en la factura; activable antes de cerrar cuenta. */
  const [mesaItbisEnabled, setMesaItbisEnabled] = useState(false);
  const [mesaItbisDefaultEnabled, setMesaItbisDefaultEnabled] = useState(false);
  const [defaultNcfType, setDefaultNcfType] = useState<NcfBCode>(DEFAULT_NCF_B_CODE);
  const [historialVersion, setHistorialVersion] = useState(0);

  useEffect(() => {
    setMesaItbisEnabled(mesaItbisDefaultEnabled);
  }, [selectedId, mesaItbisDefaultEnabled]);

  useEffect(() => {
    if (authLoading || !tenantId) return;

    let cancelled = false;

    void loadTenantBillingSettings(tenantId).then((settings) => {
      if (cancelled) return;
      setMesaItbisDefaultEnabled(settings?.defaultItbisEnabled ?? false);
      setMesaItbisEnabled(settings?.defaultItbisEnabled ?? false);
      setDefaultNcfType(settings?.defaultNcfType ?? DEFAULT_NCF_B_CODE);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  const refreshDeudaPorMesa = useCallback(async () => {
    if (!tenantId) {
      setDeudaPorMesa({});
      return;
    }
    const { data, error } = await insforgeClient.database
      .from("consumos")
      .select("mesa_numero, subtotal")
      .eq("tenant_id", tenantId)
      .neq("estado", "pagado");

    if (error || !data) {
      setDeudaPorMesa({});
      return;
    }
    const map: Record<number, number> = {};
    for (const row of data as { mesa_numero: number | null; subtotal: number }[]) {
      const mn = Number(row.mesa_numero);
      if (!Number.isFinite(mn) || mn <= 0) continue;
      map[mn] = (map[mn] ?? 0) + Number(row.subtotal);
    }
    setDeudaPorMesa(map);
  }, [tenantId]);

  useEffect(() => {
    const mesasIniciales = MESAS_CONFIG.map((config) => ({
      ...config,
      estado: "libre" as Estado,
      fusionada: false,
      fusion_padre_id: null,
      fusion_hijos: [],
      span_filas: 1,
      span_columnas: 1,
    }));
    setMesas(mesasIniciales);

    if (authLoading) return;

    if (!tenantId) {
      setDeudaPorMesa({});
      setLoading(false);
      return;
    }

    setLoading(true);

    void insforgeClient.database
      .from("mesas_estado")
      .select("*")
      .eq("tenant_id", tenantId)
      .then((estadosRes) => {
        if (!estadosRes.error && estadosRes.data && estadosRes.data.length > 0) {
          const estadosMap = new Map<number, MesaEstadoDB>();
          for (const e of estadosRes.data as MesaEstadoDB[]) {
            estadosMap.set(e.id, {
              ...e,
              fusion_hijos: e.fusion_hijos ?? [],
              span_filas: e.span_filas ?? 1,
              span_columnas: e.span_columnas ?? 1,
            });
          }

          setMesas((prev) =>
            prev.map((m) => {
              const estadoDB = estadosMap.get(m.id);
              if (estadoDB) {
                return {
                  ...m,
                  estado: estadoDB.estado,
                  fusionada: estadoDB.fusionada,
                  fusion_padre_id: estadoDB.fusion_padre_id,
                  fusion_hijos: estadoDB.fusion_hijos,
                  span_filas: estadoDB.span_filas,
                  span_columnas: estadoDB.span_columnas,
                };
              }
              return m;
            })
          );
        }

        setLoading(false);
        void refreshDeudaPorMesa();
      });
  }, [authLoading, tenantId, refreshDeudaPorMesa]);

  useEffect(() => {
    if (!tenantId || authLoading) return;
    const id = window.setInterval(() => void refreshDeudaPorMesa(), 20000);
    return () => window.clearInterval(id);
  }, [tenantId, authLoading, refreshDeudaPorMesa]);

  useEffect(() => {
    if (!tenantId) return;
    void refreshDeudaPorMesa();
  }, [tenantId, historialVersion, refreshDeudaPorMesa]);

  const selectedMesaNumero = useMemo(() => {
    if (selectedId == null) return null;
    return mesas.find((m) => m.id === selectedId)?.numero ?? null;
  }, [mesas, selectedId]);

  useEffect(() => {
    if (!tenantId || selectedMesaNumero == null) {
      setHistorialConsumos([]);
      setComandaEstados({});
      return;
    }

    let cancelled = false;

    async function loadHistorial() {
      const { data, error } = await insforgeClient.database
        .from("consumos")
        .select("id, nombre, cantidad, subtotal, precio_unitario, estado, tipo, created_at, comanda_id")
        .eq("tenant_id", tenantId)
        .eq("mesa_numero", selectedMesaNumero)
        .neq("estado", "pagado")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error || !data) {
        setHistorialConsumos([]);
        setComandaEstados({});
        return;
      }

      const rows = data as ConsumoPanelRow[];
      setHistorialConsumos(rows);

      const cids = [...new Set(rows.map((r) => r.comanda_id).filter(Boolean))] as string[];
      if (cids.length === 0) {
        setComandaEstados({});
        return;
      }

      const { data: coms, error: comErr } = await insforgeClient.database
        .from("comandas")
        .select("id, estado")
        .in("id", cids);

      if (cancelled) return;
      if (comErr || !coms) {
        setComandaEstados({});
        return;
      }

      const map: Record<string, string> = {};
      for (const c of coms as { id: string; estado: string }[]) {
        map[c.id] = c.estado;
      }
      setComandaEstados(map);
    }

    void loadHistorial();
    const tick = setInterval(() => void loadHistorial(), 25000);

    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [tenantId, selectedMesaNumero, historialVersion]);

  useEffect(() => {
    if (selectedId == null) setShowCloseAccountModal(false);
  }, [selectedId]);

  const selectedMesa = mesas.find((m) => m.id === selectedId) ?? null;
  const adjacentMesas = selectedMesa ? getAdjacentMesas(selectedMesa, mesas) : [];
  const adjacentIds = new Set(adjacentMesas.map((m) => m.id));

  const visibleMesas = mesas.filter((m) => !m.fusionada);

  const maxFila = mesas.reduce((acc, m) => Math.max(acc, m.fila), 0);
  const maxColumna = mesas.reduce((acc, m) => Math.max(acc, m.columna), 0);

  // Stats
  const libre = mesas.filter((m) => !m.fusionada && m.estado === "libre").length;
  const ocupada = mesas.filter((m) => !m.fusionada && m.estado === "ocupada").length;
  const limpieza = mesas.filter((m) => !m.fusionada && m.estado === "limpieza").length;

  async function changeEstado(mesaId: number, estado: Estado) {
    if (!tenantId) return;
    const { error } = await insforgeClient.database
      .from("mesas_estado")
      .upsert({ id: mesaId, estado, tenant_id: tenantId }, { onConflict: "tenant_id,id" });

    if (!error) {
      setMesas((prev) => prev.map((m) => (m.id === mesaId ? { ...m, estado } : m)));
    }
  }

  async function mergeMesas(parentId: number, childId: number) {
    if (!tenantId) return;
    const parent = mesas.find((m) => m.id === parentId)!;
    const child = mesas.find((m) => m.id === childId)!;

    const isHorizontal =
      child.fila === parent.fila &&
      child.columna === parent.columna + parent.span_columnas;
    const isVertical =
      child.columna === parent.columna &&
      child.fila === parent.fila + parent.span_filas;

    if (!isHorizontal && !isVertical) return;

    const newSpanCols = isHorizontal
      ? parent.span_columnas + child.span_columnas
      : parent.span_columnas;
    const newSpanFilas = isVertical
      ? parent.span_filas + child.span_filas
      : parent.span_filas;
    const newHijos = [...parent.fusion_hijos, childId];

    await Promise.all([
      insforgeClient.database
        .from("mesas_estado")
        .upsert(
          {
            id: parentId,
            tenant_id: tenantId,
            span_columnas: newSpanCols,
            span_filas: newSpanFilas,
            fusion_hijos: newHijos,
          },
          { onConflict: "tenant_id,id" }
        ),
      insforgeClient.database
        .from("mesas_estado")
        .upsert(
          {
            id: childId,
            tenant_id: tenantId,
            fusionada: true,
            fusion_padre_id: parentId,
          },
          { onConflict: "tenant_id,id" }
        ),
    ]);

    setMesas((prev) =>
      prev.map((m) => {
        if (m.id === parentId)
          return {
            ...m,
            span_columnas: newSpanCols,
            span_filas: newSpanFilas,
            fusion_hijos: newHijos,
          };
        if (m.id === childId)
          return { ...m, fusionada: true, fusion_padre_id: parentId };
        return m;
      })
    );

    setMergeMode(false);
  }

  async function splitMesa(parentId: number) {
    if (!tenantId) return;
    const parent = mesas.find((m) => m.id === parentId)!;
    const childIds = parent.fusion_hijos;

    await Promise.all([
      insforgeClient.database
        .from("mesas_estado")
        .upsert(
          {
            id: parentId,
            tenant_id: tenantId,
            span_columnas: 1,
            span_filas: 1,
            fusion_hijos: [],
          },
          { onConflict: "tenant_id,id" }
        ),
      ...childIds.map((childId) =>
        insforgeClient.database
          .from("mesas_estado")
          .upsert(
            {
              id: childId,
              tenant_id: tenantId,
              fusionada: false,
              fusion_padre_id: null,
            },
            { onConflict: "tenant_id,id" }
          )
      ),
    ]);

    setMesas((prev) =>
      prev.map((m) => {
        if (m.id === parentId)
          return { ...m, span_columnas: 1, span_filas: 1, fusion_hijos: [] };
        if (childIds.includes(m.id))
          return { ...m, fusionada: false, fusion_padre_id: null };
        return m;
      })
    );

    setSelectedId(null);
    setMergeMode(false);
  }

  function handleMesaClick(mesa: Mesa) {
    if (mergeMode && selectedId !== null && selectedId !== mesa.id) {
      if (adjacentIds.has(mesa.id)) {
        mergeMesas(selectedId, mesa.id);
      } else {
        setMergeMode(false);
      }
      return;
    }

    if (selectedId === mesa.id) {
      setSelectedId(null);
      setMergeMode(false);
    } else {
      setSelectedId(mesa.id);
      setMergeMode(false);
    }
  }

  const CELL = 120; // px — square cell size
  const GAP = 10; // px — gap between cells

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          {authLoading ? "Cargando sesión..." : "Cargando mesas..."}
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] text-center max-w-md">
          Tu usuario no está vinculado a un negocio. Las mesas y estados se guardan por restaurante
          (multitenant).
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 relative overflow-hidden flex flex-col"
      onClick={(e) => {
        // Click on backdrop cancels merge/selection
        if (e.target === e.currentTarget) {
          setSelectedId(null);
          setMergeMode(false);
        }
      }}
    >
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] pt-[16px] sm:pt-[20px] pb-[12px] sm:pb-[16px] gap-[8px] shrink-0">
        <div className="flex flex-wrap items-center gap-[12px] sm:gap-[16px]">
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
            Mesas
          </h1>
          {mergeMode && (
            <div className="bg-[rgba(255,144,109,0.1)] border border-[rgba(255,144,109,0.3)] rounded-full px-[12px] py-[4px]">
              <span className="font-['Inter',sans-serif] text-[#ff906d] text-[11px] tracking-[0.5px] uppercase font-bold">
                Seleccioná una mesa adyacente para fusionar
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-[8px] sm:gap-[12px]">
          <StatusBadge color="#59ee50" label={`${libre} Libre${libre !== 1 ? "s" : ""}`} />
          <StatusBadge color="#ff716c" label={`${ocupada} Ocupada${ocupada !== 1 ? "s" : ""}`} />
          {limpieza > 0 && (
            <StatusBadge color="#ff906d" label={`${limpieza} Limpieza`} />
          )}
        </div>
      </div>

      {/* Grid + Panel area */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Grid scroll area */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4 sm:p-[32px]">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${maxColumna}, ${CELL}px)`,
              gridTemplateRows: `repeat(${maxFila}, ${CELL}px)`,
              gap: `${GAP}px`,
              position: "relative",
            }}
          >
            {/* Grid background lines (Excel-style) */}
            {Array.from({ length: maxFila }, (_, fi) =>
              Array.from({ length: maxColumna }, (_, ci) => (
                <div
                  key={`bg-${fi}-${ci}`}
                  className="rounded-[4px] border border-[rgba(72,72,71,0.12)]"
                  style={{
                    gridColumn: ci + 1,
                    gridRow: fi + 1,
                    pointerEvents: "none",
                  }}
                />
              ))
            )}

            {/* Mesa cards */}
            {visibleMesas.map((mesa) => {
              const isSelected = selectedId === mesa.id;
              const isMergeTarget = mergeMode && adjacentIds.has(mesa.id);
              const deudaTotal =
                (deudaPorMesa[mesa.numero] ?? 0) +
                mesa.fusion_hijos.reduce((s, cid) => s + (deudaPorMesa[cid] ?? 0), 0);
              return (
                <TableMesaCard
                  key={mesa.id}
                  mesa={mesa}
                  isSelected={isSelected}
                  isMergeTarget={isMergeTarget}
                  deudaTotal={deudaTotal}
                  onClick={handleMesaClick}
                  formatCurrency={RD}
                />
              );
            })}
          </div>
        </div>

        {/* Side info panel */}
        {selectedMesa && (
          <div className="w-[280px] shrink-0 bg-[#131313] border-l border-[rgba(72,72,71,0.2)] flex flex-col p-[24px] gap-[20px] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-[2px]">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px]">
                  Mesa {selectedMesa.numero.toString().padStart(2, "0")}
                </span>
                <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
                  Fila {selectedMesa.fila} · Col {selectedMesa.columna}
                  {selectedMesa.fusion_hijos.length > 0 &&
                    ` · ${selectedMesa.span_columnas > 1 ? `${selectedMesa.span_columnas} cols` : `${selectedMesa.span_filas} filas`}`}
                </span>
              </div>
              <button
                onClick={() => { setSelectedId(null); setMergeMode(false); }}
                className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[18px] leading-none hover:text-white transition-colors"
              >
                ×
              </button>
            </div>

            <div className="h-px bg-[rgba(72,72,71,0.2)]" />

            {/* Estado */}
            <div className="flex flex-col gap-[10px]">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Estado
              </span>
              <div className="flex flex-col gap-[6px]">
                {(["libre", "ocupada", "limpieza"] as Estado[]).map((e) => {
                  const c = estadoColors[e];
                  const isActive = selectedMesa.estado === e;
                  return (
                    <button
                      key={e}
                      onClick={() => changeEstado(selectedMesa.id, e)}
                      className="flex items-center gap-[10px] px-[14px] py-[10px] rounded-[10px] cursor-pointer border-none transition-all text-left"
                      style={{
                        backgroundColor: isActive ? c.bg : "transparent",
                        border: isActive ? `1px solid ${c.border}` : "1px solid rgba(72,72,71,0.2)",
                      }}
                    >
                      <div
                        className="rounded-full size-[8px] shrink-0"
                        style={{ backgroundColor: c.dot }}
                      />
                      <span
                        className="font-['Inter',sans-serif] text-[13px] font-semibold"
                        style={{ color: isActive ? c.text : "#6b7280" }}
                      >
                        {estadoLabels[e]}
                      </span>
                      {isActive && (
                        <span className="ml-auto font-['Inter',sans-serif] text-[10px]" style={{ color: c.text }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-[rgba(72,72,71,0.2)]" />

            {/* Capacidad */}
            <div className="flex items-center justify-between">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Capacidad
              </span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px]">
                {selectedMesa.capacidad} personas
              </span>
            </div>

            <div className="h-px bg-[rgba(72,72,71,0.2)]" />

            {/* Historial de esta mesa */}
            <div className="rounded-[12px] border border-[rgba(72,72,71,0.28)] bg-[#161616] p-[14px] flex flex-col gap-[10px] shrink-0">
              <div className="flex flex-col gap-1">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                  Historial / pedido en cuenta
                </span>
                <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] leading-snug">
                  Mesa {selectedMesa.numero}. Podés cobrar aquí con el mismo flujo que en Venta (método de pago y factura).
                </span>
              </div>
              <div className="flex flex-col gap-[8px] max-h-[200px] overflow-y-auto pr-0.5 min-h-[3rem]">
                {historialConsumos.length === 0 ? (
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] text-center py-3 m-0">
                    Sin líneas en cuenta en el POS.
                  </p>
                ) : (
                  historialConsumos.map((row) => {
                    const comandaEst = row.comanda_id ? comandaEstados[row.comanda_id] : undefined;
                    const cocinaLbl = etiquetaEstadoComanda(comandaEst);
                    return (
                      <div
                        key={row.id}
                        className="rounded-[10px] border border-[rgba(72,72,71,0.25)] bg-[#1a1a1a] px-[12px] py-[10px] flex flex-col gap-[6px]"
                      >
                        <div className="flex items-start justify-between gap-[8px]">
                          <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] leading-tight">
                            {row.cantidad}× {row.nombre}
                          </span>
                          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[13px] shrink-0 tabular-nums">
                            {RD(Number(row.subtotal))}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-[6px] items-center">
                          <span
                            className={`font-['Inter',sans-serif] text-[9px] font-bold uppercase tracking-wide px-[8px] py-[3px] rounded-full ${
                              row.tipo === "cocina"
                                ? "bg-[rgba(255,144,109,0.12)] text-[#ff906d]"
                                : "bg-[rgba(89,238,80,0.12)] text-[#59ee50]"
                            }`}
                          >
                            {row.tipo === "cocina" ? "Cocina" : "Directo"}
                          </span>
                          <span className="font-['Inter',sans-serif] text-[9px] font-bold uppercase tracking-wide px-[8px] py-[3px] rounded-full bg-[rgba(255,255,255,0.06)] text-[#adaaaa]">
                            {etiquetaEstadoConsumo(row.estado)}
                          </span>
                          {cocinaLbl ? (
                            <span className="font-['Inter',sans-serif] text-[9px] font-bold uppercase tracking-wide px-[8px] py-[3px] rounded-full bg-[rgba(255,208,109,0.1)] text-[#ffd06d]">
                              {cocinaLbl}
                            </span>
                          ) : null}
                        </div>
                        <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px]">
                          {new Date(row.created_at).toLocaleString("es-DO", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              {historialConsumos.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-[rgba(72,72,71,0.28)] bg-[#131313] px-[12px] py-[10px]">
                    <div className="flex flex-col min-w-0">
                      <span className="font-['Inter',sans-serif] text-white text-[12px] font-semibold leading-tight">
                        ITBIS 18% en la factura
                      </span>
                      <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] leading-snug">
                        Toma el valor guardado en Ajustes, pero puedes cambiarlo antes de cobrar
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={mesaItbisEnabled}
                      onClick={() => setMesaItbisEnabled((v) => !v)}
                      aria-label={
                        mesaItbisEnabled ? "Desactivar ITBIS al cobrar mesa" : "Activar ITBIS 18% al cobrar mesa"
                      }
                      className={`relative h-[30px] w-[54px] shrink-0 rounded-full border-none cursor-pointer transition-colors ${
                        mesaItbisEnabled ? "bg-[#59ee50]" : "bg-[#383838]"
                      }`}
                    >
                      <span
                        className={`absolute top-[5px] left-[5px] block size-[20px] rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                          mesaItbisEnabled ? "translate-x-[24px]" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCloseAccountModal(true)}
                    className="w-full mt-1 py-[12px] rounded-[10px] border-none cursor-pointer font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[11px] tracking-[1.2px] uppercase bg-[#ff906d] hover:bg-[#ff784d] transition-colors"
                  >
                    Cerrar cuenta / Cobrar
                  </button>
                </>
              )}
            </div>

            {/* Balance pendiente */}
            {(() => {
              const t =
                (deudaPorMesa[selectedMesa.numero] ?? 0) +
                selectedMesa.fusion_hijos.reduce(
                  (s, cid) => s + (deudaPorMesa[cid] ?? 0),
                  0
                );
              return t > 0 ? (
                <>
                  <div className="h-px bg-[rgba(72,72,71,0.2)]" />
                  <div className="flex items-center justify-between">
                    <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                      Debe
                    </span>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">
                      {RD(t)}
                    </span>
                  </div>
                </>
              ) : null;
            })()}

            <div className="h-px bg-[rgba(72,72,71,0.2)]" />

            {/* Acciones de fusión */}
            <div className="flex flex-col gap-[8px]">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Fusión
              </span>

              {/* Merge button */}
              {adjacentMesas.length > 0 && (
                <button
                  onClick={() => setMergeMode((m) => !m)}
                  className="flex items-center gap-[10px] px-[14px] py-[11px] rounded-[10px] cursor-pointer border-none transition-all text-left"
                  style={{
                    backgroundColor: mergeMode
                      ? "rgba(255,144,109,0.15)"
                      : "rgba(38,38,38,0.8)",
                    border: mergeMode
                      ? "1px solid rgba(255,144,109,0.4)"
                      : "1px solid rgba(72,72,71,0.3)",
                    color: mergeMode ? "#ff906d" : "#adaaaa",
                  }}
                >
                  <span className="text-[14px]">{mergeMode ? "⟵" : "⊞"}</span>
                  <span className="font-['Inter',sans-serif] text-[13px] font-semibold">
                    {mergeMode ? "Cancelar fusión" : "Fusionar con adyacente"}
                  </span>
                </button>
              )}

              {adjacentMesas.length === 0 && selectedMesa.fusion_hijos.length === 0 && (
                <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                  Sin mesas adyacentes compatibles.
                </span>
              )}

              {/* Split button */}
              {selectedMesa.fusion_hijos.length > 0 && (
                <button
                  onClick={() => splitMesa(selectedMesa.id)}
                  className="flex items-center gap-[10px] px-[14px] py-[11px] rounded-[10px] cursor-pointer border-none transition-all text-left"
                  style={{
                    backgroundColor: "rgba(255,113,108,0.08)",
                    border: "1px solid rgba(255,113,108,0.25)",
                    color: "#ff716c",
                  }}
                >
                  <span className="text-[14px]">⊟</span>
                  <span className="font-['Inter',sans-serif] text-[13px] font-semibold">
                    Separar mesas
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedMesa && tenantId && (
        <MesaCloseAccountModal
          open={showCloseAccountModal}
          onClose={() => setShowCloseAccountModal(false)}
          tenantId={tenantId}
          mesaNumero={selectedMesa.numero}
          itbisRate={mesaItbisEnabled ? ITBIS : 0}
          initialNcfType={defaultNcfType}
          onSettled={() => {
            setHistorialVersion((v) => v + 1);
            void refreshDeudaPorMesa();
          }}
          onPaidFull={async () => {
            setHistorialVersion((v) => v + 1);
            await refreshDeudaPorMesa();
            await changeEstado(selectedMesa.id, "libre");
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return (
    <div
      className="flex gap-[6px] items-center px-[12px] py-[5px] rounded-full border border-[rgba(72,72,71,0.2)] bg-[#201f1f]"
    >
      <div className="rounded-full size-[7px]" style={{ backgroundColor: color }} />
      <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">
        {label}
      </span>
    </div>
  );
}
