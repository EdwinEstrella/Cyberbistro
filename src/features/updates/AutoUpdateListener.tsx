import { useEffect } from "react";
import { toast } from "sonner";
import type { UpdateInfoPayload } from "@/shared/types/electron";

const PROGRESS_TOAST_ID = "cyberbistro-app-update";

export function AutoUpdateListener() {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateEvents) return;

    return api.onUpdateEvents({
      onUpdateAvailable: (info: UpdateInfoPayload) => {
        toast.loading(`Nueva versión ${info.version}. Descargando…`, {
          id: PROGRESS_TOAST_ID,
          duration: Infinity,
        });
      },
      onDownloadProgress: (p) => {
        toast.loading(`Descargando actualización: ${p.percent}%`, {
          id: PROGRESS_TOAST_ID,
          duration: Infinity,
        });
      },
      onUpdateDownloaded: (info) => {
        toast.dismiss(PROGRESS_TOAST_ID);
        const ok = window.confirm(
          `La versión ${info.version} está lista. ¿Reiniciar ahora para instalar la actualización?`
        );
        if (ok) api.installUpdate?.();
      },
      onUpdateError: (msg) => {
        toast.dismiss(PROGRESS_TOAST_ID);
        toast.error(`Error de actualización: ${msg}`);
      },
    });
  }, []);

  return null;
}
