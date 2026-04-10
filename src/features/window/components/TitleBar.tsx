import { useEffect, useState } from "react";
import type { ElectronAPI } from "../../types/electron";
import svgPaths from "../../../imports/svg-h2gjocs89h";

export function TitleBar() {
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
    if (window.electronAPI) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.maximize();
    }
  };

  const handleClose = () => {
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
            v4.0.2
          </span>
        </div>
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
