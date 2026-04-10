import { useEffect, useState } from "react";
import type { ElectronAPI } from "../../../shared/types/electron";

export function WindowControls() {
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

  useEffect(() => {
    // Setup direct event listeners like in vanilla JS (more reliable)
    const minBtn = document.getElementById('window-minimize');
    const maxBtn = document.getElementById('window-maximize');
    const closeBtn = document.getElementById('window-close');

    const handleMinimize = () => {
      console.log('Direct minimize click');
      if (window.electronAPI) {
        window.electronAPI.minimize();
      }
    };

    const handleMaximize = () => {
      console.log('Direct maximize click');
      if (window.electronAPI) {
        window.electronAPI.maximize();
      }
    };

    const handleClose = () => {
      console.log('Direct close click');
      if (window.electronAPI) {
        window.electronAPI.close();
      }
    };

    if (minBtn) minBtn.addEventListener('click', handleMinimize);
    if (maxBtn) maxBtn.addEventListener('click', handleMaximize);
    if (closeBtn) closeBtn.addEventListener('click', handleClose);

    return () => {
      if (minBtn) minBtn.removeEventListener('click', handleMinimize);
      if (maxBtn) maxBtn.removeEventListener('click', handleMaximize);
      if (closeBtn) closeBtn.removeEventListener('click', handleClose);
    };
  }, []);

  return (
    <div
      className="flex items-center gap-2 absolute top-4 right-4 z-50"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <button
        id="window-minimize"
        className="w-11 h-8 flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors"
        aria-label="Minimizar"
        type="button"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <svg width="12" height="1" viewBox="0 0 12 1" fill="none">
          <rect width="12" height="1" fill="#ADAAAA" />
        </svg>
      </button>

      <button
        id="window-maximize"
        className="w-11 h-8 flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors"
        aria-label="Maximizar"
        type="button"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M1 4V1H4M6 1H9V4M9 6V9H6M4 9H1V6"
              stroke="#ADAAAA"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              stroke="#ADAAAA"
              strokeWidth="1"
            />
          </svg>
        )}
      </button>

      <button
        id="window-close"
        className="w-11 h-8 flex items-center justify-center hover:bg-red-600 rounded transition-colors"
        aria-label="Cerrar"
        type="button"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1 1L9 9M9 1L1 9"
            stroke="#ADAAAA"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
