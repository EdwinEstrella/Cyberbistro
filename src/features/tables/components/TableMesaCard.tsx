import { memo } from "react";
import { estadoColors, estadoLabels, type MesaEstadoVisual } from "../config/estadoTheme";
import { useTheme } from "../../../shared/context/ThemeContext";

type MesaCardData = {
  id: number;
  numero: number;
  capacidad: number;
  estado: MesaEstadoVisual;
  fusionada: boolean;
  fusion_padre_id: number | null;
  fila: number;
  columna: number;
  span_filas: number;
  span_columnas: number;
  fusion_hijos: number[];
};

type Props = {
  mesa: MesaCardData;
  isSelected: boolean;
  isMergeTarget: boolean;
  deudaTotal: number;
  onClick: (mesa: MesaCardData) => void;
  formatCurrency: (n: number) => string;
};

function TableMesaCardBase({
  mesa,
  isSelected,
  isMergeTarget,
  deudaTotal,
  onClick,
  formatCurrency,
}: Props) {
  const isMerged = mesa.fusion_hijos.length > 0;
  const colors = estadoColors[mesa.estado];
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // En modo claro, queremos destacar las mesas que NO están libres.
  const shouldHighlightState = !isDark && mesa.estado !== "libre";

  return (
    <button
      type="button"
      onClick={() => onClick(mesa)}
      aria-label={`Mesa ${String(mesa.numero).padStart(2, "0")} (${estadoLabels[mesa.estado]})`}
      style={{
        gridColumn: `${mesa.columna} / span ${mesa.span_columnas}`,
        gridRow: `${mesa.fila} / span ${mesa.span_filas}`,
        backgroundColor: isSelected
          ? "rgba(255,144,109,0.12)"
          : isMergeTarget
            ? "rgba(89,238,80,0.08)"
            : shouldHighlightState ? colors.bg : (isDark ? colors.bg : "white"),
        border: isSelected
          ? "2px solid #ff906d"
          : isMergeTarget
            ? "2px solid #59ee50"
            : shouldHighlightState ? `1px solid ${colors.dot}` : (isDark ? `1px solid ${colors.border}` : "1px solid black"),
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
      className="p-0 text-left"
    >
      {isMerged && (
        <div className="absolute top-[6px] right-[6px] bg-[rgba(255,144,109,0.15)] rounded-[4px] px-[6px] py-[2px] border border-black/10">
          <span className="font-['Inter',sans-serif] text-[#ff906d] text-[8px] tracking-[0.8px] uppercase font-bold">
            Fusionada
          </span>
        </div>
      )}

      {isMergeTarget ? (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[12px]"
          style={{ backgroundColor: "rgba(89,238,80,0.06)" }}
        >
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[28px]">+</span>
        </div>
      ) : (
        <>
          <span
            className="font-['Space_Grotesk',sans-serif] font-bold text-[22px]"
            style={{ color: isSelected ? "#ff906d" : (shouldHighlightState ? colors.dot : (isDark ? colors.text : "black")) }}
          >
            {mesa.numero.toString().padStart(2, "0")}
          </span>

          <div className="flex items-center gap-[5px]">
            <div className="rounded-full size-[6px]" style={{ backgroundColor: colors.dot }} />
            <span
              className="font-['Inter',sans-serif] text-[9px] tracking-[0.8px] uppercase font-bold"
              style={{ color: shouldHighlightState ? colors.dot : (isDark ? colors.text : "black"), opacity: isDark ? 0.7 : 0.6 }}
            >
              {estadoLabels[mesa.estado]}
            </span>
          </div>

          {deudaTotal > 0 ? (
            <span
              className="font-['Space_Grotesk',sans-serif] font-bold text-[10px]"
              style={{ color: isSelected ? "#ff906d" : (shouldHighlightState ? colors.dot : (isDark ? colors.text : "#ff906d")) }}
            >
              {formatCurrency(deudaTotal)}
            </span>
          ) : (
            <span className="font-['Inter',sans-serif] text-[10px] font-bold" style={{ color: isDark ? "rgba(173,170,170,0.5)" : "rgba(0,0,0,0.4)" }}>
              {mesa.capacidad} pax
            </span>
          )}
        </>
      )}
    </button>
  );
}

export const TableMesaCard = memo(TableMesaCardBase);
