import { useState } from "react";
import svgPaths from "../../imports/svg-2fgf4mgp0x";

type InvoiceStatus = "pagado" | "pendiente" | "reembolsado";

interface Invoice {
  id: string;
  date: string;
  time: string;
  tableBadge: string;
  badgeColor: string;
  badgeBg: string;
  location: string;
  guest: string;
  methodIcon: string;
  methodViewBox: string;
  method: string;
  status: InvoiceStatus;
  amount: string;
  amountColor: string;
}

const invoices: Invoice[] = [
  {
    id: "#CB-9421", date: "Oct 24, 2023", time: "14:22 PM",
    tableBadge: "T4", badgeColor: "#ff6aa0", badgeBg: "rgba(255,106,160,0.1)",
    location: "Mesa 04 -\nSección VIP", guest: "Invitado: Alex Sterling",
    methodIcon: "p7132d90", methodViewBox: "0 0 9.75 13.5", method: "Cripto\n(ETH)",
    status: "pagado", amount: "$420.00", amountColor: "white",
  },
  {
    id: "#CB-9420", date: "Oct 24, 2023", time: "14:05 PM",
    tableBadge: "B1", badgeColor: "#ff906d", badgeBg: "rgba(255,144,109,0.1)",
    location: "Barra -\nBanqueta 12", guest: "Invitado: Sin reserva",
    methodIcon: "p1aa02a80", methodViewBox: "0 0 15 15", method: "Billetera\nDigital",
    status: "pendiente", amount: "$54.30", amountColor: "white",
  },
  {
    id: "#CB-9419", date: "Oct 24, 2023", time: "13:45 PM",
    tableBadge: "T9", badgeColor: "rgba(255,255,255,0.6)", badgeBg: "rgba(72,72,71,0.2)",
    location: "Mesa 09 -\nComedor", guest: "Invitado: Marcus Vane",
    methodIcon: "p1db5c490", methodViewBox: "0 0 15 12", method: "Tarjeta\nCrédito",
    status: "reembolsado", amount: "-$12.00", amountColor: "#d7383b",
  },
  {
    id: "#CB-9418", date: "Oct 24, 2023", time: "13:12 PM",
    tableBadge: "V1", badgeColor: "#ff6aa0", badgeBg: "rgba(255,106,160,0.1)",
    location: "Suite\nPrivada - V01", guest: "Invitado:\nCorporativo - NeoGen",
    methodIcon: "p1db5c490", methodViewBox: "0 0 15 12", method: "Tarjeta\nCrédito",
    status: "pagado", amount: "$2,140.00", amountColor: "white",
  },
];

const statusConfig: Record<InvoiceStatus, { label: string; color: string; bg: string; shadow?: string }> = {
  pagado: { label: "PAGADO", color: "#59ee50", bg: "rgba(89,238,80,0.1)", shadow: "0px 0px 15px 0px rgba(89,238,80,0.2)" },
  pendiente: { label: "PENDIENTE", color: "#ff906d", bg: "rgba(255,144,109,0.1)" },
  reembolsado: { label: "REEMBOLSADO", color: "#ff716c", bg: "rgba(255,113,108,0.1)" },
};

const chartBars = [
  { h: "38px", opacity: 0.2 },
  { h: "58px", opacity: 0.3 },
  { h: "53px", opacity: 0.4 },
  { h: "77px", opacity: 0.6 },
  { h: "62px", opacity: 0.5 },
  { h: "86px", opacity: 0.8 },
  { h: "96px", opacity: 1 },
];

export function Billing() {
  const [currentPage, setCurrentPage] = useState(1);

  return (
    <div className="flex-1 p-[32px] flex flex-col gap-[32px] overflow-auto">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-[24px]">
        {/* Revenue */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden relative">
          <div className="flex flex-col gap-[16px] p-[24px] pb-[54px]">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase">
              Ingreso Total (24h)
            </div>
            <div className="flex items-end">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[48px] tracking-[-1.2px]">$14,284</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[24px] tracking-[-1.2px]">.50</span>
            </div>
            <div className="flex gap-[8px] items-center">
              <svg className="w-[12px] h-[7px]" fill="none" viewBox="0 0 11.6667 7"><path d={svgPaths.pde19380} fill="#59EE50" /></svg>
              <span className="font-['Inter',sans-serif] font-medium text-[#59ee50] text-[14px]">+12.4% vs ayer</span>
            </div>
          </div>
          <div className="absolute bg-[rgba(255,144,109,0.05)] blur-[32px] right-[-16px] rounded-full size-[96px] top-[-16px]" />
        </div>

        {/* Average Ticket */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden">
          <div className="flex flex-col gap-[16px] p-[24px] pb-[54px]">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase">
              Ticket Promedio
            </div>
            <div className="flex items-end">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[48px] tracking-[-1.2px]">$84</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[24px] tracking-[-1.2px]">.20</span>
            </div>
            <div className="flex gap-[8px] items-center">
              <div className="bg-white/40 h-px w-[9px]" />
              <span className="font-['Inter',sans-serif] font-medium text-white/40 text-[14px]">Volumen constante</span>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-[#201f1f] rounded-[24px] overflow-hidden">
          <div className="flex flex-col gap-[16px] p-[24px] pb-[34px]">
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase">
              Facturas Pendientes
            </div>
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[48px] tracking-[-1.2px]">
              12
            </div>
            <div className="flex gap-[8px] items-center">
              <svg className="size-[12px]" fill="none" viewBox="0 0 11.6667 11.6667"><path d={svgPaths.p29478120} fill="#FF6AA0" /></svg>
              <span className="font-['Inter',sans-serif] font-medium text-[#ff6aa0] text-[14px]">$1,420 en espera de aprobación</span>
            </div>
          </div>
        </div>

        {/* 7D Trend */}
        <div className="bg-[#131313] rounded-[24px] border border-[rgba(255,144,109,0.05)]">
          <div className="flex flex-col justify-between p-[25px] h-full">
            <div className="flex items-start justify-between">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase">Tendencia 7D</span>
              <svg className="size-[18px]" fill="none" viewBox="0 0 18 18"><path d={svgPaths.p4c2b800} fill="#FF906D" /></svg>
            </div>
            <div className="flex gap-[6px] items-end h-[96px] pb-[8px]">
              {chartBars.map((bar, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{
                    height: bar.h,
                    backgroundColor: `rgba(255,144,109,${bar.opacity})`,
                    boxShadow: i === 6 ? "0px -4px 10px 0px rgba(255,144,109,0.3)" : undefined,
                  }}
                />
              ))}
            </div>
            <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] text-center">
              Pico de crecimiento semanal
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] rounded-[16px] border border-[rgba(255,255,255,0.05)] p-[17px] flex items-center justify-between">
        <div className="flex gap-[16px] items-center">
          <div className="bg-black rounded-[12px] border border-[rgba(72,72,71,0.3)] flex items-center px-[17px] py-[9px] gap-[8px]">
            <svg className="w-[17px] h-[10px]" fill="none" viewBox="0 0 17 10"><path d={svgPaths.p2eec2540} fill="#ADAAAA" /></svg>
            <span className="font-['Inter',sans-serif] text-white text-[14px]">Últimos 30 Días</span>
            <svg className="size-[21px]" fill="none" viewBox="0 0 21 21"><path d="M6.3 8.4L10.5 12.6L14.7 8.4" stroke="#6B7280" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.575" /></svg>
          </div>
          <div className="bg-black rounded-[12px] border border-[rgba(72,72,71,0.3)] flex items-center px-[17px] py-[9px] gap-[8px]">
            <svg className="w-[16px] h-[8px]" fill="none" viewBox="0 0 16.0206 8"><path d={svgPaths.p1bdc3fa0} fill="#ADAAAA" /></svg>
            <span className="font-['Inter',sans-serif] text-white text-[14px]">Todos los Estados</span>
            <svg className="size-[21px]" fill="none" viewBox="0 0 21 21"><path d="M6.3 8.4L10.5 12.6L14.7 8.4" stroke="#6B7280" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.575" /></svg>
          </div>
          <div className="bg-black rounded-[12px] border border-[rgba(72,72,71,0.3)] flex items-center px-[17px] py-[9px] gap-[8px]">
            <svg className="w-[19px] h-[8px]" fill="none" viewBox="0 0 19 8"><path d={svgPaths.p34cb4a00} fill="#ADAAAA" /></svg>
            <span className="font-['Inter',sans-serif] text-white text-[14px]">Todos los Métodos</span>
            <svg className="size-[21px]" fill="none" viewBox="0 0 21 21"><path d="M6.3 8.4L10.5 12.6L14.7 8.4" stroke="#6B7280" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.575" /></svg>
          </div>
        </div>
        <button className="bg-[#262626] rounded-[12px] border border-[rgba(72,72,71,0.2)] flex gap-[8px] items-center px-[25px] py-[9px] cursor-pointer">
          <svg className="size-[9px]" fill="none" viewBox="0 0 9.33333 9.33333"><path d={svgPaths.p21f4d300} fill="white" /></svg>
          <span className="font-['Inter',sans-serif] text-white text-[16px]">Exportar CSV</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#131313] rounded-[24px] border border-[rgba(72,72,71,0.1)] overflow-hidden">
        {/* Header Row */}
        <div className="bg-[rgba(32,31,31,0.5)] grid grid-cols-[100px_120px_1fr_110px_130px_120px_140px] px-[32px]">
          {["ID\nFactura", "Fecha", "Cliente /\nMesa", "Método", "Estado", "Monto", "Acciones"].map((h, i) => (
            <div key={i} className={`py-[20px] ${i >= 5 ? "text-right" : ""}`}>
              <span className="font-['Inter',sans-serif] font-bold text-[#adaaaa] text-[10px] tracking-[2px] uppercase whitespace-pre-line">{h}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {invoices.map((inv, idx) => {
          const status = statusConfig[inv.status];
          return (
            <div key={inv.id} className={`grid grid-cols-[100px_120px_1fr_110px_130px_120px_140px] px-[32px] items-center ${idx > 0 ? "border-t border-[rgba(255,255,255,0.05)]" : ""}`}>
              {/* ID */}
              <div className="py-[32px]">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] whitespace-pre-line">{inv.id}</span>
              </div>
              {/* Date */}
              <div className="py-[32px]">
                <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] whitespace-pre-line">{inv.date}</div>
                <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] opacity-50">{inv.time}</div>
              </div>
              {/* Customer */}
              <div className="py-[32px] flex gap-[12px] items-center">
                <div className="rounded-[8px] flex items-center justify-center h-[32px] px-[4px]" style={{ backgroundColor: inv.badgeBg }}>
                  <span className="font-['Inter',sans-serif] font-bold text-[12px]" style={{ color: inv.badgeColor }}>{inv.tableBadge}</span>
                </div>
                <div>
                  <div className="font-['Inter',sans-serif] font-medium text-white text-[14px] whitespace-pre-line">{inv.location}</div>
                  <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] whitespace-pre-line">{inv.guest}</div>
                </div>
              </div>
              {/* Method */}
              <div className="py-[32px] flex gap-[8px] items-center">
                <svg className="w-[15px] h-[14px] shrink-0" fill="none" viewBox={inv.methodViewBox}>
                  <path d={(svgPaths as any)[inv.methodIcon]} fill="white" fillOpacity="0.7" />
                </svg>
                <span className="font-['Inter',sans-serif] text-[rgba(255,255,255,0.7)] text-[12px] whitespace-pre-line">{inv.method}</span>
              </div>
              {/* Status */}
              <div className="py-[32px]">
                <div className="flex gap-[6px] items-center px-[12px] py-[4px] rounded-full w-fit" style={{ backgroundColor: status.bg, boxShadow: status.shadow }}>
                  <div className="rounded-full size-[6px]" style={{ backgroundColor: status.color }} />
                  <span className="font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase" style={{ color: status.color }}>{status.label}</span>
                </div>
              </div>
              {/* Amount */}
              <div className="py-[32px] text-right">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[18px]" style={{ color: inv.amountColor }}>{inv.amount}</span>
              </div>
              {/* Actions */}
              <div className="py-[32px] flex gap-[8px] justify-end">
                {[svgPaths.p1b1e2a00, svgPaths.p13fa9e80, svgPaths.p1c659f80].map((icon, i) => (
                  <button key={i} className="bg-[#262626] rounded-[8px] size-[32px] flex items-center justify-center border-none cursor-pointer">
                    <svg className="w-[12px] h-[10px]" fill="none" viewBox={i === 0 ? "0 0 12.8333 8.75" : i === 1 ? "0 0 11.6667 11.6667" : "0 0 11.6667 9.33333"}>
                      <path d={icon} fill="white" fillOpacity="0.5" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Pagination */}
        <div className="border-t border-[rgba(255,255,255,0.05)] px-[32px] py-[24px] flex items-center justify-between">
          <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px]">
            Mostrando <span className="text-white font-bold">1 - 4</span> de <span className="text-white font-bold">152</span> transacciones
          </span>
          <div className="flex gap-[8px] items-center">
            <button className="size-[32px] rounded-[8px] bg-[#262626] flex items-center justify-center border-none cursor-pointer">
              <svg className="w-[4px] h-[7px]" fill="none" viewBox="0 0 4.31667 7"><path d={svgPaths.p10965ac0} fill="white" fillOpacity="0.5" /></svg>
            </button>
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`size-[32px] rounded-[8px] flex items-center justify-center border-none cursor-pointer font-['Inter',sans-serif] font-bold text-[12px] ${
                  p === currentPage ? "bg-[#59ee50] text-black" : "bg-[#262626] text-white/50"
                }`}
              >
                {p}
              </button>
            ))}
            <span className="font-['Inter',sans-serif] text-white/30 text-[12px]">...</span>
            <button
              onClick={() => setCurrentPage(38)}
              className={`size-[32px] rounded-[8px] flex items-center justify-center border-none cursor-pointer font-['Inter',sans-serif] font-bold text-[12px] ${
                currentPage === 38 ? "bg-[#59ee50] text-black" : "bg-[#262626] text-white/50"
              }`}
            >
              38
            </button>
            <button className="size-[32px] rounded-[8px] bg-[#262626] flex items-center justify-center border-none cursor-pointer">
              <svg className="w-[4px] h-[7px]" fill="none" viewBox="0 0 4.31667 7"><path d={svgPaths.p35022f90} fill="white" fillOpacity="0.5" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
