import { useState, useEffect } from "react";
import { useNavigate } from "react-router";

const STORAGE_KEY = "cyberbistro-cobrar-hint-expanded";

/** Barra inferior fija en todo el sistema: cómo cobrar cuenta abierta (no en módulo Entregas aislado). */
export function PersistentCobrarHint({ visible }: { visible: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [expanded]);

  if (!visible) return null;

  return (
    <div
      className="shrink-0 border-t border-[rgba(72,72,71,0.35)] bg-[#121212] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] z-30"
      role="region"
      aria-label="Cómo cobrar en el punto de venta"
    >
      <div className="px-3 sm:px-6 py-2 sm:py-2.5 flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] sm:text-[12px] leading-snug min-w-0 flex-1">
          <span className="text-[#ff906d] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] mr-2">
            Cobrar
          </span>
          Cuenta abierta se cobra en{" "}
          <span className="text-white/90 font-medium">Venta</span>: mesa arriba → botón naranja{" "}
          <span className="text-white/90 font-medium">Cobrar</span>.
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] sm:text-[11px] uppercase tracking-wide border-none bg-transparent cursor-pointer hover:text-[#adaaaa] px-1"
            aria-expanded={expanded}
          >
            {expanded ? "Menos" : "Pasos"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-[8px] border border-[rgba(255,144,109,0.4)] bg-[rgba(255,144,109,0.12)] px-3 py-1.5 font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[10px] sm:text-[11px] uppercase tracking-wide cursor-pointer hover:bg-[rgba(255,144,109,0.2)]"
          >
            Ir a Venta
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="px-3 sm:px-6 pb-3 pt-0 border-t border-[rgba(72,72,71,0.2)]">
          <ol className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] leading-relaxed list-decimal pl-[1.15rem] m-0 mt-2 space-y-1 max-w-3xl">
            <li>
              Menú lateral: <span className="text-white font-medium">Venta</span>.
            </li>
            <li>
              Arriba: <span className="text-white font-medium">Seleccionar mesa</span> → la mesa que cobrás.
            </li>
            <li>
              Panel derecho: botón naranja <span className="text-white font-medium">Cobrar</span> → método de pago →
              confirmar (genera factura).
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
