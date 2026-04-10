import { useState } from "react";
import svgPaths from "../../../imports/svg-6uw0vd28yv";

type TableStatus = "libre" | "ocupada" | "limpieza";

interface TableData {
  id: string;
  number: string;
  status: TableStatus;
  badge?: number;
  shape: "square" | "circle" | "wide";
  position: { left: string; top: string };
}

const tables: TableData[] = [
  { id: "01", number: "01", status: "ocupada", badge: 4, shape: "square", position: { left: "calc(50% - 176px)", top: "calc(50% - 176px)" } },
  { id: "02", number: "02", status: "libre", shape: "square", position: { left: "50%", top: "calc(50% - 176px)" } },
  { id: "03", number: "03", status: "limpieza", shape: "square", position: { left: "calc(50% + 176px)", top: "calc(50% - 176px)" } },
  { id: "04-05", number: "04|05", status: "ocupada", badge: 12, shape: "wide", position: { left: "calc(50% - 176px)", top: "50%" } },
  { id: "06", number: "06", status: "libre", shape: "circle", position: { left: "calc(50% + 80px)", top: "50%" } },
  { id: "08", number: "08", status: "libre", shape: "square", position: { left: "calc(50% - 88px)", top: "calc(50% + 176px)" } },
  { id: "09", number: "09", status: "libre", shape: "square", position: { left: "calc(50% + 88px)", top: "calc(50% + 176px)" } },
];

const statusColors: Record<TableStatus, { border: string; shadow: string; text: string }> = {
  libre: { border: "#59ee50", shadow: "rgba(89,238,80,0.3)", text: "#59ee50" },
  ocupada: { border: "#ff716c", shadow: "rgba(255,113,108,0.3)", text: "#ff716c" },
  limpieza: { border: "#ff906d", shadow: "rgba(255,144,109,0.3)", text: "#ff906d" },
};

const activityItems = [
  { type: "Cuenta Pagada", color: "#59ee50", text: "Mesa 08 recién liberada.", time: "Hace 2 minutos" },
  { type: "Advertencia", color: "#ff716c", text: "Mesa 01: Pedido con 15m de retraso.", time: "Hace 5 minutos" },
  { type: "Llegada VIP", color: "#ff6aa0", text: "Sr. Sato sentado en mesa 04.", time: "Hace 12 minutos" },
  { type: "Servicio", color: "#ff906d", text: "Mesa 03 necesita limpieza.", time: "Hace 18 minutos" },
];

const floorTabs = ["Comedor Principal", "Área de Bar", "Terraza", "Salón VIP"];

function TableNode({ table }: { table: TableData }) {
  const colors = statusColors[table.status];
  const isWide = table.shape === "wide";
  const isCircle = table.shape === "circle";
  const numbers = table.number.split("|");

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: table.position.left, top: table.position.top }}
    >
      <div
        className={`bg-[#262626] flex items-center justify-center p-[2px] relative ${isCircle ? "rounded-full" : "rounded-[16px]"}`}
        style={{
          width: isWide ? 288 : 128,
          height: 128,
          boxShadow: `0px 0px 15px 0px ${colors.shadow}`,
          border: `2px solid ${colors.border}`,
        }}
      >
        {table.status === "limpieza" && (
          <div className="absolute inset-0 bg-[rgba(255,144,109,0.1)] rounded-[16px]" />
        )}
        {isWide ? (
          <div className="flex gap-[32px] items-center">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[24px]" style={{ color: colors.text }}>{numbers[0]}</span>
            <div className="bg-[rgba(72,72,71,0.3)] h-[48px] w-px" />
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[24px]" style={{ color: colors.text }}>{numbers[1]}</span>
          </div>
        ) : (
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[24px] relative z-10" style={{ color: colors.text }}>
            {table.number}
          </span>
        )}
        {table.badge && (
          <div className="absolute bg-[#ff716c] rounded-full size-[24px] -top-[8px] -right-[8px] flex items-center justify-center">
            <span className="font-['Inter',sans-serif] font-bold text-[#490006] text-[10px]">{table.badge}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Tables() {
  const [activeFloor, setActiveFloor] = useState(0);

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Radial glow decoration */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: "radial-gradient(ellipse at center, rgba(255,144,109,0.1) 0%, rgba(255,144,109,0) 70%)"
      }} />

      {/* Title & Status badges */}
      <div className="absolute top-[16px] left-[32px] z-10">
        <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[36px]">Comedor Principal</h1>
      </div>
      <div className="absolute top-[72px] left-[32px] z-10 flex gap-[12px]">
        <div className="bg-[#201f1f] flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-[rgba(72,72,71,0.2)]">
          <div className="bg-[#59ee50] rounded-full size-[8px]" />
          <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[10px] tracking-[1px] uppercase">12 Libres</span>
        </div>
        <div className="bg-[#201f1f] flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-[rgba(72,72,71,0.2)]">
          <div className="bg-[#ff716c] rounded-full size-[8px]" />
          <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[10px] tracking-[1px] uppercase">8 Ocupadas</span>
        </div>
        <div className="bg-[#201f1f] flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-[rgba(72,72,71,0.2)]">
          <div className="bg-[#ff906d] rounded-full size-[8px]" />
          <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[10px] tracking-[1px] uppercase">2 Limpieza</span>
        </div>
      </div>

      {/* Zoom + Quick Booking buttons */}
      <div className="absolute top-[16px] right-[370px] z-10 flex gap-[8px]">
        <div className="bg-[#201f1f] rounded-[12px] p-[13px] border border-[rgba(72,72,71,0.1)] cursor-pointer">
          <svg className="size-[18px]" fill="none" viewBox="0 0 18 18"><path d={svgPaths.p3fc48a20} fill="white" /></svg>
        </div>
        <div className="bg-[#201f1f] rounded-[12px] p-[13px] border border-[rgba(72,72,71,0.1)] cursor-pointer">
          <svg className="size-[18px]" fill="none" viewBox="0 0 18 18"><path d={svgPaths.p2899ed00} fill="white" /></svg>
        </div>
      </div>
      <button className="absolute top-[16px] right-[32px] z-10 bg-[#ff906d] flex gap-[8px] items-center px-[24px] py-[12px] rounded-[12px] border-none cursor-pointer shadow-[0px_0px_20px_0px_rgba(255,144,109,0.3)]">
        <svg className="size-[14px]" fill="none" viewBox="0 0 14 14"><path d={svgPaths.p2bb32400} fill="#460F00" /></svg>
        <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[16px]">Reserva Rápida</span>
      </button>

      {/* Floor Plan with grid background */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(255,144,109,0.05) 2.5%, rgba(255,144,109,0) 2.5%), linear-gradient(rgba(255,144,109,0.05) 2.5%, rgba(255,144,109,0) 2.5%)",
          backgroundSize: "40px 40px",
        }}
      >
        <div className="bg-[#131313] rounded-[32px] border border-[rgba(72,72,71,0.2)] relative shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]" style={{ width: 864, height: 700 }}>
          {tables.map((table) => (
            <TableNode key={table.id} table={table} />
          ))}
          {/* Kitchen boundary */}
          <div className="absolute bottom-px left-px right-px h-[64px] bg-[#131313] rounded-b-[32px] border-t border-[rgba(72,72,71,0.3)] flex items-center justify-center">
            <span className="font-['Inter',sans-serif] font-bold text-[10px] text-[rgba(173,170,170,0.4)] tracking-[4px] uppercase">
              Acceso Servicio Cocina
            </span>
          </div>
        </div>
      </div>

      {/* Activity Panel */}
      <div className="absolute top-[96px] right-[32px] bottom-[32px] w-[320px] backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] rounded-[32px] border border-[rgba(72,72,71,0.1)] p-[25px] flex flex-col gap-[24px] z-10">
        <div className="border-b border-[rgba(72,72,71,0.2)] pb-[17px]">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">Actividad en Vivo</span>
        </div>
        <div className="flex flex-col gap-[16px] overflow-auto flex-1 pr-[8px]">
          {activityItems.map((item, i) => (
            <div key={i} className="bg-[#201f1f] rounded-[12px] relative">
              <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-[12px]" style={{ backgroundColor: item.color }} />
              <div className="flex flex-col gap-[4px] pl-[16px] pr-[12px] py-[12px]">
                <span className="font-['Inter',sans-serif] font-bold text-[10px] uppercase" style={{ color: item.color }}>{item.type}</span>
                <span className="font-['Inter',sans-serif] font-semibold text-white text-[14px]">{item.text}</span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px]">{item.time}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Kitchen Load */}
        <div className="bg-[#262626] rounded-[16px] p-[16px] flex flex-col gap-[8px]">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[12px] tracking-[1.2px] uppercase pb-[4px]">
            Carga de Cocina
          </span>
          <div className="bg-black h-[8px] rounded-full overflow-hidden">
            <div className="bg-[#ff906d] h-full w-3/4 rounded-full" />
          </div>
          <div className="flex justify-between">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px]">Óptimo</span>
            <span className="font-['Inter',sans-serif] font-bold text-[#ff906d] text-[10px]">75% Capacidad</span>
          </div>
        </div>
      </div>

      {/* Floor Navigation */}
      <div className="absolute bottom-[40px] left-1/2 -translate-x-1/2 backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] rounded-[16px] border border-[rgba(72,72,71,0.1)] p-[9px] flex gap-[16px] z-10">
        {floorTabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveFloor(i)}
            className={`px-[25px] py-[9px] rounded-[12px] font-['Inter',sans-serif] font-bold text-[12px] tracking-[1.2px] uppercase border-none cursor-pointer ${
              i === activeFloor
                ? "bg-[#262626] text-[#ff906d] border border-[rgba(255,144,109,0.2)]"
                : "bg-transparent text-[#adaaaa]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}