import { useEffect, useState } from "react";
import type { ElectronAPI } from "../../../shared/types/electron";
import svgPaths from "../../../imports/svg-h2gjocs89h";
import { useTheme } from "../../../shared/context/ThemeContext";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useSucursal } from "../../../app/context/SucursalContext";

interface TitleBarProps {
  showSidebarToggle?: boolean;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
  onShowBranchUpsell?: () => void;
  onAddBranch?: () => void;
}

export function TitleBar({
  showSidebarToggle = false,
  sidebarHidden = false,
  onToggleSidebar,
  onShowBranchUpsell,
  onAddBranch,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const { theme, toggleTheme } = useTheme();
  
  const { plan, isAuthenticated } = useAuth();
  const { activeSucursalId, setActiveSucursalId, sucursales, deleteSucursal } = useSucursal();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeSucursal = sucursales.find(s => s.id === activeSucursalId);

  useEffect(() => {
    // Listen for maximize/unmaximize events from main process
    if (window.electronAPI) {
      const api = window.electronAPI as ElectronAPI;
      if (api.onWindowMaximized) {
        const cleanup = api.onWindowMaximized((maximized: boolean) => {
          setIsMaximized(maximized);
        });
        return cleanup;
      }
    }
  }, []);

  const handleMinimize = () => {
    console.log('[TitleBar] minimize clicked, electronAPI:', window.electronAPI);
    if (window.electronAPI) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    console.log('[TitleBar] maximize clicked, electronAPI:', window.electronAPI);
    if (window.electronAPI) {
      window.electronAPI.maximize();
    }
  };

  const handleClose = () => {
    console.log('[TitleBar] close clicked, electronAPI:', window.electronAPI);
    if (window.electronAPI) {
      window.electronAPI.close();
    }
  };

  return (
    <div
      className="flex items-center justify-between h-9 bg-sidebar border-b border-black/10 dark:border-white/10 select-none transition-colors duration-300"
      style={{ WebkitAppRegion: 'drag' as any }}
    >
      {/* Left side - Title/Logo */}
      <div className="flex items-center gap-2 px-3">
        <div className="h-[30px] w-[22.5px] flex items-center justify-center">
          <svg className="w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 22.5 30">
            <path d={svgPaths.p280a6f80} fill="#FF906D" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[10px] tracking-[-0.5px] uppercase leading-tight">
            Cloudix
          </span>
          <span className="font-['Inter',sans-serif] text-foreground/60 text-[8px] tracking-[0.8px] uppercase leading-tight">
            v{__APP_VERSION__}
          </span>
        </div>
        {showSidebarToggle ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center bg-transparent hover:bg-sidebar-accent transition-colors shrink-0 ml-1 p-0"
            style={{ WebkitAppRegion: "no-drag" as any }}
            aria-label={sidebarHidden ? "Mostrar barra lateral" : "Ocultar barra lateral"}
            title={sidebarHidden ? "Mostrar sidebar" : "Ocultar sidebar"}
          >
            {sidebarHidden ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                  stroke="#FF906D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="9"
                  y1="3"
                  x2="9"
                  y2="21"
                  stroke="#FF906D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                  stroke="#FF906D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="9"
                  y1="3"
                  x2="9"
                  y2="21"
                  stroke="#FF906D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ) : null}

        {/* Basic plan branch display with add button */}
        {isAuthenticated && (!plan || (plan !== "profesional" && plan !== "empresarial")) && (
          <div className="flex items-center gap-1 ml-2" style={{ WebkitAppRegion: "no-drag" as any }}>
            <button
              type="button"
              onClick={onShowBranchUpsell}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-white/5 hover:bg-white/10 dark:bg-white/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-[11px] font-['Space_Grotesk',sans-serif] font-medium text-foreground/80 transition-all cursor-pointer select-none"
            >
              <svg className="size-[12px] text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>Matriz (Única)</span>
            </button>
            <button
              type="button"
              onClick={onShowBranchUpsell}
              className="flex items-center justify-center size-7 rounded-[6px] bg-white/5 hover:bg-[#ff906d]/20 dark:bg-white/5 dark:hover:bg-[#ff906d]/20 border border-black/10 dark:border-white/10 text-[#ff906d] transition-all cursor-pointer font-bold select-none"
              title="Agregar Sucursal"
            >
              <svg className="size-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        )}

        {/* Professional/Empresarial plan branch dropdown + plus button */}
        {isAuthenticated && (plan === "profesional" || plan === "empresarial") && sucursales.length > 0 && (
          <div className="flex items-center gap-1 ml-2" style={{ WebkitAppRegion: "no-drag" as any }}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-[#ff906d]/10 hover:bg-[#ff906d]/20 border border-[rgba(255,144,109,0.3)] text-[11px] font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] transition-all cursor-pointer select-none"
              >
                <svg className="size-[12px] text-[#ff906d] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>{activeSucursal?.nombre || "Cargando sucursal..."}</span>
                <svg className={`size-[10px] text-[#ff906d] transition-transform duration-200 shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 w-[200px] z-50 bg-[#131313] border border-white/10 rounded-[10px] shadow-[0px_8px_24px_rgba(0,0,0,0.5)] p-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <span className="text-[9px] uppercase tracking-[0.5px] text-[#ff906d] font-bold px-2 py-1 font-['Space_Grotesk',sans-serif]">
                      Cambiar Sucursal
                    </span>
                    <div className="h-px bg-white/5 my-0.5" />
                    {sucursales.map((suc) => {
                      const isSelected = suc.id === activeSucursalId;
                      return (
                        <div
                          key={suc.id}
                          className="flex items-center justify-between w-full rounded-[6px] transition-colors hover:bg-white/5 group"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSucursalId(suc.id);
                              setDropdownOpen(false);
                            }}
                            className={`flex-1 text-left px-2.5 py-1.5 font-['Space_Grotesk',sans-serif] text-[11px] transition-colors cursor-pointer border-none bg-transparent ${
                              isSelected
                                ? "text-[#ff906d] font-bold"
                                : "text-[#adaaaa] group-hover:text-white"
                            }`}
                          >
                            {suc.nombre}
                          </button>
                          
                          <div className="flex items-center pr-2">
                            {isSelected && (
                              <svg className="size-[12px] text-[#ff906d] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            
                            {!isSelected && sucursales.length > 1 && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (confirm(`¿Estás seguro de que querés eliminar la sucursal "${suc.nombre}"?`)) {
                                    const res = await deleteSucursal(suc.id);
                                    if (!res.success) {
                                      alert(res.error);
                                    }
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 flex items-center justify-center size-5 rounded hover:bg-red-500/20 text-[#adaaaa] hover:text-red-400 transition-all border-none bg-transparent cursor-pointer"
                                title="Eliminar Sucursal"
                              >
                                <svg className="size-[12px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={
                plan === "profesional" && sucursales.length >= 3
                  ? onShowBranchUpsell
                  : onAddBranch
              }
              className="flex items-center justify-center size-7 rounded-[6px] bg-white/5 hover:bg-[#ff906d]/20 dark:bg-white/5 dark:hover:bg-[#ff906d]/20 border border-black/10 dark:border-white/10 text-[#ff906d] transition-all cursor-pointer font-bold select-none"
              title="Agregar Sucursal"
            >
              <svg className="size-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Center - Empty drag area */}
      <div className="flex-1" style={{ WebkitAppRegion: 'drag' as any }} />

      {/* Right side - Window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' as any }}
      >
        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="h-full px-3 flex items-center justify-center hover:bg-sidebar-accent border-none bg-transparent cursor-pointer text-foreground transition-all"
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {theme === "dark" ? (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {Boolean(window.electronAPI) && (
          <>
            {/* Minimize Button */}
            <button
              onClick={handleMinimize}
              className="w-11 h-full flex items-center justify-center hover:bg-white/5 transition-colors"
              aria-label="Minimizar"
              type="button"
            >
              <svg width="12" height="1" viewBox="0 0 12 1" fill="none">
                <rect width="12" height="1" fill="currentColor" />
              </svg>
            </button>

            {/* Maximize/Restore Button */}
            <button
              onClick={handleMaximize}
              className="w-11 h-full flex items-center justify-center hover:bg-white/5 transition-colors"
              aria-label={isMaximized ? "Restaurar" : "Maximizar"}
              type="button"
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1 4V1H4M6 1H9V4M9 6V9H6M4 9H1V6"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect
                    x="0.5"
                    y="0.5"
                    width="9"
                    height="9"
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="none"
                  />
                </svg>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="w-11 h-full flex items-center justify-center hover:bg-[#e81123] transition-colors group"
              aria-label="Cerrar"
              type="button"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="group-hover:stroke-white">
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
