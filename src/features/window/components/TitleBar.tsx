import { useEffect, useState } from "react";
import type { ElectronAPI } from "../../../shared/types/electron";
import svgPaths from "../../../imports/svg-h2gjocs89h";

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
      className="flex items-center justify-between h-9 bg-[#0e0e0e] border-b border-[rgba(255,144,109,0.1)] select-none"
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
          <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[8px] tracking-[0.8px] uppercase leading-tight">
            v{__APP_VERSION__}
          </span>
        </div>
        {showSidebarToggle ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center bg-transparent hover:bg-[rgba(255,144,109,0.12)] transition-colors shrink-0 ml-1 p-0"
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
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' as any }}
      >
        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          className="w-11 h-9 flex items-center justify-center hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          aria-label="Minimizar"
          type="button"
        >
          <svg width="12" height="1" viewBox="0 0 12 1" fill="none">
            <rect width="12" height="1" fill="#ADAAAA" />
          </svg>
        </button>

        {/* Maximize/Restore Button */}
        <button
          onClick={handleMaximize}
          className="w-11 h-9 flex items-center justify-center hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          aria-label={isMaximized ? "Restaurar" : "Maximizar"}
          type="button"
        >
          {isMaximized ? (
            // Restore icon
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M1 4V1H4M6 1H9V4M9 6V9H6M4 9H1V6"
                stroke="#ADAAAA"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            // Maximize icon
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                stroke="#ADAAAA"
                strokeWidth="1"
                fill="none"
              />
            </svg>
          )}
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="w-11 h-9 flex items-center justify-center hover:bg-[#e81123] transition-colors group"
          aria-label="Cerrar"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="group-hover:stroke-white">
            <path
              d="M1 1L9 9M9 1L1 9"
              stroke="#ADAAAA"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
