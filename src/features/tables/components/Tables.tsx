import { useState, useEffect } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";

type Estado = "libre" | "ocupada" | "limpieza";

interface Mesa {
  id: number;
  numero: number;
  fila: number;
  columna: number;
  capacidad: number;
  estado: Estado;
  fusionada: boolean;
  fusion_padre_id: number | null;
  fusion_hijos: number[];
  span_filas: number;
  span_columnas: number;
}

const estadoColors: Record<Estado, { border: string; bg: string; text: string; dot: string }> = {
  libre: {
    border: "rgba(89,238,80,0.5)",
    bg: "rgba(89,238,80,0.06)",
    text: "#59ee50",
    dot: "#59ee50",
  },
  ocupada: {
    border: "rgba(255,113,108,0.5)",
    bg: "rgba(255,113,108,0.06)",
    text: "#ff716c",
    dot: "#ff716c",
  },
  limpieza: {
    border: "rgba(255,144,109,0.5)",
    bg: "rgba(255,144,109,0.06)",
    text: "#ff906d",
    dot: "#ff906d",
  },
};

const estadoLabels: Record<Estado, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  limpieza: "Limpieza",
};

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

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ComandaRaw {
  mesa_id: number;
  items: Array<{ precio: number; cantidad: number }>;
}

export function Tables() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mesaTotals, setMesaTotals] = useState<Record<number, number>>({});

  useEffect(() => {
    Promise.all([
      insforgeClient.database
        .from("mesas")
        .select("*")
        .order("fila", { ascending: true })
        .order("columna", { ascending: true }),
      insforgeClient.database
        .from("comandas")
        .select("mesa_id,items")
        .in("estado", ["pendiente", "en_preparacion", "listo"]),
    ]).then(([mesasRes, comandasRes]) => {
      if (!mesasRes.error && mesasRes.data) {
        setMesas(
          (mesasRes.data as Mesa[]).map((m) => ({
            ...m,
            fusion_hijos: m.fusion_hijos ?? [],
            span_filas: m.span_filas ?? 1,
            span_columnas: m.span_columnas ?? 1,
          }))
        );
      }
      if (!comandasRes.error && comandasRes.data) {
        const totals: Record<number, number> = {};
        for (const c of comandasRes.data as ComandaRaw[]) {
          if (!c.mesa_id) continue;
          const sum = (c.items ?? []).reduce(
            (s, i) => s + (i.precio ?? 0) * (i.cantidad ?? 0),
            0
          );
          totals[c.mesa_id] = (totals[c.mesa_id] ?? 0) + sum;
        }
        setMesaTotals(totals);
      }
      setLoading(false);
    });
  }, []);

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
    const { error } = await insforgeClient.database
      .from("mesas")
      .update({ estado })
      .eq("id", mesaId);
    if (!error) {
      setMesas((prev) => prev.map((m) => (m.id === mesaId ? { ...m, estado } : m)));
    }
  }

  async function mergeMesas(parentId: number, childId: number) {
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
        .from("mesas")
        .update({
          span_columnas: newSpanCols,
          span_filas: newSpanFilas,
          fusion_hijos: newHijos,
        })
        .eq("id", parentId),
      insforgeClient.database
        .from("mesas")
        .update({ fusionada: true, fusion_padre_id: parentId })
        .eq("id", childId),
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
    const parent = mesas.find((m) => m.id === parentId)!;
    const childIds = parent.fusion_hijos;

    await Promise.all([
      insforgeClient.database
        .from("mesas")
        .update({ span_columnas: 1, span_filas: 1, fusion_hijos: [] })
        .eq("id", parentId),
      ...childIds.map((childId) =>
        insforgeClient.database
          .from("mesas")
          .update({ fusionada: false, fusion_padre_id: null })
          .eq("id", childId)
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando mesas...
        </span>
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
              const isMerged = mesa.fusion_hijos.length > 0;
              const colors = estadoColors[mesa.estado];

              return (
                <div
                  key={mesa.id}
                  onClick={() => handleMesaClick(mesa)}
                  style={{
                    gridColumn: `${mesa.columna} / span ${mesa.span_columnas}`,
                    gridRow: `${mesa.fila} / span ${mesa.span_filas}`,
                    backgroundColor: isSelected
                      ? "rgba(255,144,109,0.12)"
                      : isMergeTarget
                      ? "rgba(89,238,80,0.08)"
                      : colors.bg,
                    border: isSelected
                      ? "2px solid rgba(255,144,109,0.8)"
                      : isMergeTarget
                      ? "2px solid rgba(89,238,80,0.7)"
                      : `2px solid ${colors.border}`,
                    boxShadow: isSelected
                      ? "0 0 20px rgba(255,144,109,0.25)"
                      : isMergeTarget
                      ? "0 0 16px rgba(89,238,80,0.2)"
                      : undefined,
                    borderRadius: 12,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    position: "relative",
                    userSelect: "none",
                    transition: "border 0.15s, box-shadow 0.15s, background 0.15s",
                  }}
                >
                  {/* Merged indicator */}
                  {isMerged && (
                    <div
                      className="absolute top-[6px] right-[6px] bg-[rgba(255,144,109,0.15)] rounded-[4px] px-[6px] py-[2px]"
                    >
                      <span className="font-['Inter',sans-serif] text-[#ff906d] text-[8px] tracking-[0.8px] uppercase font-bold">
                        Fusionada
                      </span>
                    </div>
                  )}

                  {/* Merge target "+" */}
                  {isMergeTarget && (
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-[12px]"
                      style={{ backgroundColor: "rgba(89,238,80,0.06)" }}
                    >
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[28px]">
                        +
                      </span>
                    </div>
                  )}

                  {!isMergeTarget && (
                    <>
                      {/* Mesa number */}
                      <span
                        className="font-['Space_Grotesk',sans-serif] font-bold text-[22px]"
                        style={{ color: isSelected ? "#ff906d" : colors.text }}
                      >
                        {mesa.numero.toString().padStart(2, "0")}
                      </span>

                      {/* Status dot + label */}
                      <div className="flex items-center gap-[5px]">
                        <div
                          className="rounded-full size-[6px]"
                          style={{ backgroundColor: colors.dot }}
                        />
                        <span
                          className="font-['Inter',sans-serif] text-[9px] tracking-[0.8px] uppercase"
                          style={{ color: colors.text, opacity: 0.7 }}
                        >
                          {estadoLabels[mesa.estado]}
                        </span>
                      </div>

                      {/* Pending bill */}
                      {(() => {
                        const t =
                          (mesaTotals[mesa.id] ?? 0) +
                          mesa.fusion_hijos.reduce(
                            (s, cid) => s + (mesaTotals[cid] ?? 0),
                            0
                          );
                        return t > 0 ? (
                          <span
                            className="font-['Space_Grotesk',sans-serif] font-bold text-[10px]"
                            style={{ color: isSelected ? "#ff906d" : colors.text }}
                          >
                            {RD(t)}
                          </span>
                        ) : (
                          <span className="font-['Inter',sans-serif] text-[10px] text-[rgba(173,170,170,0.5)]">
                            {mesa.capacidad} pax
                          </span>
                        );
                      })()}
                    </>
                  )}
                </div>
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

            {/* Balance pendiente */}
            {(() => {
              const t =
                (mesaTotals[selectedMesa.id] ?? 0) +
                selectedMesa.fusion_hijos.reduce(
                  (s, cid) => s + (mesaTotals[cid] ?? 0),
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