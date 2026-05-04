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
      className="flex items-center justify-between h-9 bg-background border-b border-black dark:border-black select-none transition-colors duration-300"
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
          <span className="font-['Inter',sans-serif] text-muted-foreground text-[8px] tracking-[0.8px] uppercase leading-tight">
            v{__APP_VERSION__}
          </span>
        </div>
        {showSidebarToggle ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center bg-transparent hover:bg-accent transition-colors shrink-0 ml-1 p-0"
            style={{ WebkitAppRegion: "no-drag" as any }}
            aria-label={sidebarHidden ? "Mostrar barra lateral" : "Ocultar barra lateral"}
            title={sidebarHidden ? "Mostrar sidebar" : "Ocultar sidebar"}
          >
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
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="w-11 h-9 flex items-center justify-center hover:bg-accent transition-colors"
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
          type="button"
        >
          {theme === "dark" ? (
            // Sun icon (Light mode trigger)
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.5 1.49933V0.5M7.5 14.4908V13.4915M13.5 7.49542H14.5M1.5 7.49542H0.5M2.5 2.49866L1.5 1.49933M13.5 1.49933L12.5 2.49866M2.5 12.4921L1.5 13.4915M13.5 13.4915L12.5 12.4921M10.5 7.49542C10.5 9.15134 9.157 10.4935 7.5 10.4935C5.843 10.4935 4.5 9.15134 4.5 7.49542C4.5 5.8395 5.843 4.49738 7.5 4.49738C9.157 4.49738 10.5 5.8395 10.5 7.49542Z" stroke="currentColor" strokeLinecap="square" className="text-foreground" />
            </svg>
          ) : (
            // Moon icon (Dark mode trigger)
            <svg width="16" height="16" viewBox="0 -4.5 155 155" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M121.957 103.163C125.881 102.928 129.837 102.923 133.72 102.388C136.915 101.948 140.025 100.889 143.171 100.09C144.691 99.7039 146.182 99.1546 147.722 98.9084C149.978 98.5468 152.001 99.1598 153.325 101.147C154.572 103.018 154.264 104.954 153.333 106.905C148.513 117.012 140.849 124.655 131.986 131.141C121.135 139.082 108.699 143.113 95.4809 144.727C83.273 146.22 71.0442 146.272 58.9531 143.581C41.4413 139.684 26.3475 131.645 15.1444 117.275C4.13504 103.155 -0.0989723 87.0189 1.45589 69.2977C2.82654 52.995 8.52934 37.3547 17.9739 23.9961C23.4215 16.2146 29.9055 9.38657 38.073 4.33996C41.1493 2.43658 44.3527 0.861628 48.0742 0.664725C51.9288 0.463885 53.2713 2.38262 51.5635 5.85005C49.1278 10.7962 47.0392 15.8499 46.0186 21.3061C44.6114 28.8264 45.0945 36.2542 46.782 43.6767C50.4181 59.6657 57.3876 73.8803 68.9806 85.6373C78.1431 95.0885 90.3707 100.969 103.474 102.226C109.604 102.883 115.778 103.131 121.932 103.566C121.939 103.437 121.948 103.299 121.957 103.163ZM135.166 114.522L134.675 113.716C132.895 113.803 131.106 113.809 129.336 113.989C121.505 114.712 113.623 114.668 105.801 113.858C85.496 111.959 68.9865 103.067 56.2719 87.1816C46.7389 75.1897 40.233 61.0786 37.3039 46.0418C35.0461 34.9057 35.1379 23.989 39.2774 13.2736C39.3607 13.0583 39.1666 12.7358 39.0373 12.1897C37.6078 13.4486 36.2878 14.4907 35.1064 15.6688C18.843 31.9145 10.5927 51.6164 10.1962 74.5235C9.93043 89.8451 14.8215 103.357 25.3577 114.71C34.7177 124.796 46.4814 130.463 59.6646 133.425C72.5478 136.32 85.5466 136.06 98.4981 133.917C108.934 132.191 118.632 128.475 127.031 121.894C129.905 119.647 132.464 116.992 135.166 114.522Z" fill="currentColor" className="text-foreground" />
            </svg>
          )}
        </button>

        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          className="w-11 h-9 flex items-center justify-center hover:bg-accent transition-colors"
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
          className="w-11 h-9 flex items-center justify-center hover:bg-accent transition-colors"
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
