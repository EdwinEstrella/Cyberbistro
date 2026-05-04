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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMerged = mesa.fusion_hijos.length > 0;
  
  // Custom theme colors for light mode to match the mockup (occupied = coral/orange)
  const colors = isDark ? estadoColors[mesa.estado] : {
    bg: mesa.estado === 'ocupada' ? 'rgba(255,144,109,0.1)' : 'var(--card)',
    border: mesa.estado === 'ocupada' ? '#ff906d' : 'rgba(0,0,0,0.1)',
    text: mesa.estado === 'ocupada' ? '#ff784d' : 'var(--foreground)',
    dot: mesa.estado === 'ocupada' ? '#ff906d' : (mesa.estado === 'libre' ? '#59ee50' : '#adaaaa')
  };

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
            : colors.bg,
        border: isSelected
          ? "2px solid rgba(255,144,109,0.8)"
          : isMergeTarget
            ? "2px solid rgba(89,238,80,0.7)"
            : `1px solid ${colors.border}`,
        boxShadow: isSelected
          ? "0 0 20px rgba(255,144,109,0.25)"
          : isMergeTarget
            ? "0 0 16px rgba(89,238,80,0.2)"
            : "0 2px 4px rgba(0,0,0,0.02)",
        borderRadius: 12,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        position: "relative",
        userSelect: "none",
        transition: "all 0.15s ease",
      }}
      className="border-none p-0 text-left transition-colors duration-300"
    >
      {isMerged && (
        <div className="absolute top-[6px] right-[6px] bg-[#ff906d]/15 rounded-[4px] px-[6px] py-[2px]">
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
            className="font-['Space_Grotesk',sans-serif] font-bold text-[22px] transition-colors duration-300"
            style={{ color: isSelected ? "#ff906d" : colors.text }}
          >
            {mesa.numero.toString().padStart(2, "0")}
          </span>

          <div className="flex items-center gap-[5px]">
            <div className="rounded-full size-[6px] transition-colors duration-300" style={{ backgroundColor: colors.dot }} />
            <span
              className="font-['Inter',sans-serif] text-[9px] tracking-[0.8px] uppercase transition-colors duration-300"
              style={{ color: colors.text, opacity: 0.7 }}
            >
              {estadoLabels[mesa.estado]}
            </span>
          </div>

          {deudaTotal > 0 ? (
            <span
              className="font-['Space_Grotesk',sans-serif] font-bold text-[10px] transition-colors duration-300"
              style={{ color: isSelected ? "#ff906d" : colors.text }}
            >
              {formatCurrency(deudaTotal)}
            </span>
          ) : (
            <span className="font-['Inter',sans-serif] text-[10px] text-muted-foreground/50 transition-colors duration-300">
              {mesa.capacidad} pax
            </span>
          )}
        </>
      )}
    </button>
  );
}

export const TableMesaCard = memo(TableMesaCardBase);
