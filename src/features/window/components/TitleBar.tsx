import { useEffect, useState } from "react";
import type { ElectronAPI } from "../../../shared/types/electron";
import svgPaths from "../../../imports/svg-h2gjocs89h";
import { useTheme } from "../../../shared/context/ThemeContext";

interface TitleBarProps {
  showSidebarToggle?: boolean;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}

export function TitleBar({
  showSidebarToggle = false,
  sidebarHidden = false,
  onToggleSidebar,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const { theme, toggleTheme } = useTheme();

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
            CyberBistro
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
      </div>
    </div>
  );
}
