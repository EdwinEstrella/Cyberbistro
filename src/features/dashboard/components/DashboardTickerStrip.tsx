import { memo } from "react";

const TICKER_ITEMS = [
  { text: "Sistema de punto de venta Cloudix OS", color: "#adaaaa" },
  { text: "● Cocina en vivo: activa", color: "#59ee50" },
  { text: "Seleccioná una mesa y agregá platos al pedido", color: "#adaaaa" },
  { text: "● Envía a cocina con un clic", color: "#ff906d" },
] as const;

function DashboardTickerStripBase() {
  return (
    <div className="bg-[#131313] py-[8px] border-b border-[rgba(255,144,109,0.1)] overflow-hidden shrink-0">
      <div className="flex gap-[48px]">
        {TICKER_ITEMS.map((item, i) => (
          <span
            key={i}
            className="font-['Space_Grotesk',sans-serif] text-[10px] tracking-[2px] uppercase whitespace-nowrap"
            style={{ color: item.color }}
          >
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export const DashboardTickerStrip = memo(DashboardTickerStripBase);
