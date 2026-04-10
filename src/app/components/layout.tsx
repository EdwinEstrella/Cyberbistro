import { Outlet, useNavigate, useLocation } from "react-router";
import { useState, useEffect } from "react";
import svgPaths from "../../imports/svg-qgatbhef3k";
import imgManagerProfile from "figma:asset/9b19a898761052a1578ea4d6c5791772d9acadb1.png";
import { TitleBar } from "./TitleBar";

const sideNavItems = [
  { label: "Panel", icon: svgPaths.p20793584, viewBox: "0 0 18 18", path: "/dashboard" },
  { label: "Mesas", icon: svgPaths.p186f5ba0, viewBox: "0 0 18 18", path: "/tables" },
  { label: "Inventario", icon: svgPaths.p643d217, viewBox: "0 0 20 20", path: "/inventory" },
  { label: "Analíticas", icon: svgPaths.p30837e80, viewBox: "0 0 18 18", path: "/billing" },
  { label: "Soporte", icon: svgPaths.p18c14180, viewBox: "0 0 20 16", path: "/support" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/dashboard": return "Panel Principal";
      case "/tables": return "Gestión de Planta";
      case "/billing": return "Historial de Facturación";
      default: return "Panel Principal";
    }
  };

  return (
    <div className="bg-[#0e0e0e] flex flex-col min-h-screen w-full">
      {/* TitleBar */}
      <TitleBar />

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="bg-[#131313] flex flex-col w-[256px] shrink-0 h-[calc(100vh-36px)] sticky top-9 z-20">
        <div className="flex flex-col gap-[4px] p-[24px]">
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[24px] tracking-[-0.6px] uppercase">
            CyberBistro
          </div>
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[1px] uppercase">
            Sistema de Gestión
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-[8px] px-[16px] pt-[16px]">
          {sideNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <div
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`flex gap-[16px] items-center px-[16px] py-[12px] rounded-none cursor-pointer relative ${isActive ? "bg-[#262626]" : ""}`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#ff906d]" />}
                <svg className="shrink-0 size-[18px]" fill="none" viewBox={item.viewBox}>
                  <path d={item.icon} fill={isActive ? "#FF906D" : "#6B7280"} />
                </svg>
                <span className={`font-['Space_Grotesk',sans-serif] text-[16px] tracking-[-0.4px] ${isActive ? "font-bold text-[#ff906d]" : "text-[#6b7280]"}`}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[rgba(72,72,71,0.2)] px-[16px] py-[16px] flex flex-col gap-[8px]">
          <div className="flex gap-[16px] items-center px-[16px] py-[12px] cursor-pointer">
            <svg className="shrink-0 w-[20px] h-[20px]" fill="none" viewBox="0 0 20.1 20"><path d={svgPaths.p3cdadd00} fill="#6B7280" /></svg>
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px] tracking-[-0.4px]">Ajustes</span>
          </div>
          <div className="flex gap-[16px] items-center px-[16px] py-[12px] cursor-pointer" onClick={() => navigate("/")}>
            <svg className="shrink-0 size-[18px]" fill="none" viewBox="0 0 18 18"><path d={svgPaths.p3e9df400} fill="#6B7280" /></svg>
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px] tracking-[-0.4px]">Cerrar Sesión</span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Shared Header */}
        <header className="backdrop-blur-[6px] bg-[rgba(14,14,14,0.6)] flex items-center justify-between h-[64px] px-[32px] border-b border-[rgba(72,72,71,0.2)] sticky top-0 z-10 shadow-[0px_4px_24px_0px_rgba(255,144,109,0.08)]">
          <div className="flex gap-[24px] items-center">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[18px] uppercase">CyberBistro OS</span>
            <div className="bg-[rgba(72,72,71,0.3)] h-[16px] w-px" />
            <div className="bg-[#201f1f] flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-[rgba(72,72,71,0.2)]">
              <div className="bg-[#59ee50] rounded-full size-[8px]" />
              <span className="font-['Space_Grotesk',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.5px] uppercase">Cocina en Vivo</span>
            </div>
          </div>
          <div className="flex gap-[24px] items-center">
            <div className="relative">
              <div className="bg-[#131313] rounded-[2px] w-[256px] pl-[40px] pr-[16px] py-[6px]">
                <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[12px] tracking-[-0.6px] uppercase">BUSCAR...</span>
              </div>
              <svg className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[10.5px] h-[10.5px]" fill="none" viewBox="0 0 10.5 10.5">
                <path d={svgPaths.p210dd580} fill="#ADAAAA" />
              </svg>
            </div>
            <div className="flex gap-[16px] items-center">
              <svg className="w-[18px] h-[21px]" fill="none" viewBox="0 0 18 21"><path d={svgPaths.pe40b59c} fill="#ADAAAA" /></svg>
              <svg className="w-[20px] h-[14.15px]" fill="none" viewBox="0 0 20 14.15"><path d={svgPaths.p793b600} fill="#ADAAAA" /></svg>
              <div className="relative w-[16px] h-[20px]">
                <svg className="absolute inset-[-20%_-25%_0_0] w-[20px] h-[24px]" fill="none" viewBox="0 0 20.01 24">
                  <path d={svgPaths.p28252700} fill="#ADAAAA" />
                  <rect fill="#FF6AA0" height="8" rx="4" width="8" x="12.01" />
                </svg>
              </div>
            </div>
            <div className="flex gap-[12px] items-center pl-[25px] border-l border-[rgba(72,72,71,0.2)]">
              <div className="text-right">
                <div className="font-['Inter',sans-serif] font-bold text-white text-[10px] uppercase">M. Kusanagi</div>
                <div className="font-['Inter',sans-serif] text-[#ff906d] text-[8px] tracking-[-0.4px] uppercase">Gerente de Piso</div>
              </div>
              <div className="rounded-full size-[32px] overflow-hidden border border-[rgba(255,144,109,0.3)]">
                <img alt="" className="size-full object-cover" src={imgManagerProfile} />
              </div>
            </div>
          </div>
        </header>

        <Outlet />
      </div>
      </div>
    </div>
  );
}
