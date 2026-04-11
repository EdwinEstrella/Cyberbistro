import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { UpdateInfoPayload } from "@/shared/types/electron";

export type AppUpdatePhase =
  | "idle"
  | "unsupported"
  | "checking"
  | "available"
  | "downloading"
  | "ready";

const PROGRESS_TOAST_ID = "cyberbistro-app-update";

type AppUpdateContextValue = {
  phase: AppUpdatePhase;
  remoteVersion: string | null;
  downloadPercent: number | null;
  /** Campanita: hay actualización en curso o lista para instalar */
  hasUpdateBellAlert: boolean;
  checkForUpdates: () => void;
  installUpdate: () => void;
  showUpdateBellToast: () => void;
};

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AppUpdatePhase>(() =>
    typeof window !== "undefined" && window.electronAPI?.onUpdateEvents
      ? "idle"
      : "unsupported"
  );
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const manualCheckPendingRef = useRef(false);

  const hasUpdateBellAlert =
    phase === "available" || phase === "downloading" || phase === "ready";

  const installUpdate = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  const checkForUpdates = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.checkForUpdates) {
      toast.error("Las actualizaciones solo están disponibles en la app de escritorio.");
      return;
    }
    manualCheckPendingRef.current = true;
    setPhase("checking");
    toast.loading("Buscando actualizaciones…", { id: "cyberbistro-check-update", duration: 8000 });
    api.checkForUpdates();
  }, []);

  const showUpdateBellToast = useCallback(() => {
    if (!hasUpdateBellAlert) {
      toast.info("No hay actualizaciones pendientes en este momento.");
      return;
    }
    const v = remoteVersion ?? "nueva";
    if (phase === "ready") {
      toast.message(`CyberBistro ${v} listo`, {
        description: "Reiniciá la app para aplicar la actualización.",
        action: {
          label: "Reiniciar e instalar",
          onClick: () => installUpdate(),
        },
      });
      return;
    }
    if (phase === "downloading") {
      toast.message(`Descargando ${v}`, {
        description: `Progreso: ${downloadPercent ?? 0}%`,
      });
      return;
    }
    toast.message(`Actualización disponible (${v})`, {
      description: "Se está descargando en segundo plano. Podés seguir usando la app.",
    });
  }, [downloadPercent, hasUpdateBellAlert, installUpdate, phase, remoteVersion]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateEvents) return;

    return api.onUpdateEvents({
      onUpdateAvailable: (info: UpdateInfoPayload) => {
        manualCheckPendingRef.current = false;
        toast.dismiss("cyberbistro-check-update");
        setRemoteVersion(info.version);
        setPhase("available");
        setDownloadPercent(null);
        toast.loading(`Nueva versión ${info.version}. Descargando…`, {
          id: PROGRESS_TOAST_ID,
          duration: Infinity,
        });
      },
      onUpdateNotAvailable: () => {
        toast.dismiss("cyberbistro-check-update");
        if (manualCheckPendingRef.current) {
          toast.success("Ya tenés la última versión instalada.");
          manualCheckPendingRef.current = false;
        }
        setPhase((p) => (p === "checking" || p === "idle" ? "idle" : p));
      },
      onDownloadProgress: (p) => {
        setPhase("downloading");
        setDownloadPercent(p.percent);
        toast.loading(`Descargando actualización: ${p.percent}%`, {
          id: PROGRESS_TOAST_ID,
          duration: Infinity,
        });
      },
      onUpdateDownloaded: (info) => {
        manualCheckPendingRef.current = false;
        toast.dismiss(PROGRESS_TOAST_ID);
        setPhase("ready");
        setRemoteVersion(info.version);
        setDownloadPercent(100);
        const ok = window.confirm(
          `La versión ${info.version} está lista. ¿Reiniciar ahora para instalar la actualización?`
        );
        if (ok) installUpdate();
      },
      onUpdateError: (msg) => {
        manualCheckPendingRef.current = false;
        toast.dismiss("cyberbistro-check-update");
        toast.dismiss(PROGRESS_TOAST_ID);
        setPhase("idle");
        setDownloadPercent(null);
        toast.error(`Error de actualización: ${msg}`);
      },
    });
  }, [installUpdate]);

  const value = useMemo(
    () => ({
      phase,
      remoteVersion,
      downloadPercent,
      hasUpdateBellAlert,
      checkForUpdates,
      installUpdate,
      showUpdateBellToast,
    }),
    [
      phase,
      remoteVersion,
      downloadPercent,
      hasUpdateBellAlert,
      checkForUpdates,
      installUpdate,
      showUpdateBellToast,
    ]
  );

  return (
    <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>
  );
}

export function useAppUpdate(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) {
    throw new Error("useAppUpdate must be used within AppUpdateProvider");
  }
  return ctx;
}

/** Para componentes que pueden montarse fuera del provider (no debería pasar). */
export function useAppUpdateOptional(): AppUpdateContextValue | null {
  return useContext(AppUpdateContext);
}
