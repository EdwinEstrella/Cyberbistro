import { useState, useEffect, useMemo } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";

import svgPaths from "../../imports/svg-qgatbhef3k";
import { TitleBar } from "../../features/window";
import { insforgeClient } from "../../shared/lib/insforge";
import { useAuth } from "../../shared/hooks/useAuth";
import {
  canAccessCocinaRoute,
  showAjustesInSidebar,
  showSoporteInSidebar,
} from "../../shared/lib/roleNav";
import { RoleGuard } from "./RoleGuard";
import { useAppUpdate } from "../../features/updates/AppUpdateContext";

const mainNavItems = [
  { label: "Venta", icon: svgPaths.p20793584, viewBox: "0 0 18 18", path: "/dashboard" },
  { label: "Mesas", icon: svgPaths.p186f5ba0, viewBox: "0 0 18 18", path: "/tables" },
  { label: "Cocina", icon: svgPaths.p643d217, viewBox: "0 0 20 20", path: "/cocina" },
  { label: "Entregas", icon: svgPaths.p18098d80, viewBox: "0 0 15 13.5", path: "/entregas" },
  { label: "Analíticas", icon: svgPaths.p30837e80, viewBox: "0 0 18 18", path: "/billing" },
  { label: "Cierre", icon: svgPaths.p2fcd0500, viewBox: "0 0 18 18", path: "/cierre" },
] as const;

const soporteNavItem = {
  label: "Soporte",
  icon: svgPaths.p18c14180,
  viewBox: "0 0 20 16",
  path: "/soporte",
} as const;

function filterMainNavForRol(rol: string | null) {
  if (rol === "admin") return [...mainNavItems];
  if (rol === "cocina") return mainNavItems.filter((i) => i.path === "/cocina");
  if (rol === "mesero" || rol === "cajero") {
    const base = ["/dashboard", "/tables", "/entregas"] as const;
    const allow = rol === "cajero" ? [...base, "/cierre"] : [...base];
    return mainNavItems.filter((i) => allow.includes(i.path as (typeof allow)[number]));
  }
  return mainNavItems.filter((i) => i.path === "/dashboard");
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { rol, signOut } = useAuth();
  const { hasUpdateBellAlert, showUpdateBellToast } = useAppUpdate();
  const [cocinaActiva, setCocinaActiva] = useState(true);

  const sideNavItems = useMemo(() => {
    const main = filterMainNavForRol(rol);
    if (showSoporteInSidebar(rol)) {
      return [...main, soporteNavItem];
    }
    return main;
  }, [rol]);

  // Re-fetch kitchen status on every route change so the badge stays in sync
  useEffect(() => {
    insforgeClient.database
      .from("cocina_estado")
      .select("activa")
      .limit(1)
      .then(({ data, error }) => {
        if (!error && data?.[0]) {
          setCocinaActiva(data[0].activa);
        }
      });
  }, [location.pathname]);

  const isAjustesActive = location.pathname === "/ajustes";

  return (
    <div className="bg-[#0e0e0e] flex flex-col h-full min-h-0 w-full overflow-hidden">
      {/* TitleBar */}
      <TitleBar />

      <RoleGuard>
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="bg-[#131313] flex flex-col w-[256px] shrink-0 min-h-0 self-stretch z-20">
          <nav className="flex-1 flex flex-col gap-[8px] px-[16px] pt-[16px]">
            {sideNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <div
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={`flex gap-[16px] items-center px-[16px] py-[12px] rounded-none cursor-pointer relative ${isActive ? "bg-[#262626]" : ""}`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#ff906d]" />
                  )}
                  <svg className="shrink-0 size-[18px]" fill="none" viewBox={item.viewBox}>
                    <path
                      d={item.icon}
                      fill={isActive ? "#FF906D" : "#6B7280"}
                    />
                  </svg>
                  <span
                    className={`font-['Space_Grotesk',sans-serif] text-[16px] tracking-[-0.4px] ${
                      isActive ? "font-bold text-[#ff906d]" : "text-[#6b7280]"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-[rgba(72,72,71,0.2)] px-[16px] py-[16px] flex flex-col gap-[8px]">
            {/* Ajustes — solo administrador del negocio */}
            {showAjustesInSidebar(rol) && (
              <div
                onClick={() => navigate("/ajustes")}
                className={`flex gap-[16px] items-center px-[16px] py-[12px] cursor-pointer relative ${isAjustesActive ? "bg-[#262626]" : ""}`}
              >
                {isAjustesActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#ff906d]" />
                )}
                <svg className="shrink-0 w-[20px] h-[20px]" fill="none" viewBox="0 0 20.1 20">
                  <path d={svgPaths.p3cdadd00} fill={isAjustesActive ? "#FF906D" : "#6B7280"} />
                </svg>
                <span
                  className={`font-['Space_Grotesk',sans-serif] text-[16px] tracking-[-0.4px] ${
                    isAjustesActive ? "font-bold text-[#ff906d]" : "text-[#6b7280]"
                  }`}
                >
                  Ajustes
                </span>
              </div>
            )}

            {/* Cerrar Sesión */}
            <div
              className="flex gap-[16px] items-center px-[16px] py-[12px] cursor-pointer"
              onClick={async () => {
                try {
                  await signOut();
                } catch {
                  /* sesión ya inválida */
                }
                navigate("/");
              }}
            >
              <svg className="shrink-0 size-[18px]" fill="none" viewBox="0 0 18 18">
                <path d={svgPaths.p3e9df400} fill="#6B7280" />
              </svg>
              <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px] tracking-[-0.4px]">
                Cerrar Sesión
              </span>
            </div>
          </div>
        </aside>

        {/* Main area — min-h-0 + scroll en <main> para que el contenido no quede cortado (Electron) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Shared Header */}
          <header className="backdrop-blur-[6px] bg-[rgba(14,14,14,0.6)] flex items-center justify-between h-[64px] px-4 sm:px-6 lg:px-[32px] border-b border-[rgba(72,72,71,0.2)] sticky top-0 z-10 shadow-[0px_4px_24px_0px_rgba(255,144,109,0.08)]">
            <div className="flex gap-[8px] sm:gap-[24px] items-center min-w-0">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px] sm:text-[18px] uppercase">
                CyberBistro OS
              </span>
              <div className="hidden sm:block bg-[rgba(72,72,71,0.3)] h-[16px] w-px" />
              {/* Cocina en Vivo badge — reactive to DB */}
              <div
                className={`bg-[#201f1f] flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-[rgba(72,72,71,0.2)] transition-all ${
                  canAccessCocinaRoute(rol) ? "cursor-pointer" : "cursor-default opacity-90"
                }`}
                onClick={() => {
                  if (canAccessCocinaRoute(rol)) navigate("/cocina");
                }}
                title={
                  canAccessCocinaRoute(rol)
                    ? cocinaActiva
                      ? "Cocina abierta"
                      : "Cocina cerrada"
                    : "Estado de cocina (solo personal de cocina o administrador abre la vista)"
                }
              >
                <div
                  className="rounded-full size-[8px] transition-colors"
                  style={{ backgroundColor: cocinaActiva ? "#59ee50" : "#ff716c" }}
                />
                <span className="font-['Space_Grotesk',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.5px] uppercase">
                  {cocinaActiva ? "Cocina en Vivo" : "Cocina Cerrada"}
                </span>
              </div>
            </div>
            <div className="flex gap-[12px] sm:gap-[24px] items-center shrink-0">
              <div className="hidden md:relative md:block">
                <div className="bg-[#131313] rounded-[2px] w-[256px] pl-[40px] pr-[16px] py-[6px]">
                  <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[12px] tracking-[-0.6px] uppercase">
                    BUSCAR...
                  </span>
                </div>
                <svg
                  className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[10.5px] h-[10.5px]"
                  fill="none"
                  viewBox="0 0 10.5 10.5"
                >
                  <path d={svgPaths.p210dd580} fill="#ADAAAA" />
                </svg>
              </div>
              <div className="flex gap-[16px] items-center">
                <svg className="w-[18px] h-[21px]" fill="none" viewBox="0 0 18 21">
                  <path d={svgPaths.pe40b59c} fill="#ADAAAA" />
                </svg>
                <svg className="w-[20px] h-[14.15px]" fill="none" viewBox="0 0 20 14.15">
                  <path d={svgPaths.p793b600} fill="#ADAAAA" />
                </svg>
                <button
                  type="button"
                  onClick={showUpdateBellToast}
                  title={
                    hasUpdateBellAlert
                      ? "Hay una actualización de la app"
                      : "Notificaciones"
                  }
                  aria-label={
                    hasUpdateBellAlert
                      ? "Hay una actualización disponible. Tocá para ver detalles."
                      : "Notificaciones"
                  }
                  className="relative w-[16px] h-[20px] shrink-0 border-none bg-transparent p-0 cursor-pointer"
                >
                  <svg
                    className="absolute inset-[-20%_-25%_0_0] w-[20px] h-[24px] pointer-events-none"
                    fill="none"
                    viewBox="0 0 20.01 24"
                    aria-hidden
                  >
                    <path
                      d={svgPaths.p28252700}
                      fill={hasUpdateBellAlert ? "#ff906d" : "#ADAAAA"}
                    />
                  </svg>
                  {hasUpdateBellAlert ? (
                    <span
                      className="absolute top-[-4px] right-[-6px] size-[9px] rounded-full bg-[#ffb020] shadow-[0_0_10px_rgba(255,176,32,0.85)] pointer-events-none motion-safe:animate-pulse"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
      </RoleGuard>
    </div>
  );
}