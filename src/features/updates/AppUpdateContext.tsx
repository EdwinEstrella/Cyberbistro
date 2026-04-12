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
const CHECK_UPDATE_TOAST_ID = "cyberbistro-check-update";
/** Mismo repo que `build.publish` en package.json (comprobación en paralelo si el updater no notifica). */
const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/EdwinEstrella/Cyberbistro/releases/latest";

function normalizeReleaseTag(tag: string | undefined): string {
  if (!tag) return "";
  return tag.replace(/^v/i, "").trim();
}

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
    toast.loading("Buscando actualizaciones…", {
      id: CHECK_UPDATE_TOAST_ID,
      duration: 60_000,
    });

    const current = String(__APP_VERSION__).trim();
    void fetch(GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ tag_name?: string }>) : null))
      .then((data) => {
        if (data == null || !manualCheckPendingRef.current) return;
        const remote = normalizeReleaseTag(data.tag_name);
        if (!remote) return;
        if (remote === current) {
          manualCheckPendingRef.current = false;
          toast.dismiss(CHECK_UPDATE_TOAST_ID);
          setPhase("idle");
          toast.success("Ya tenés la última versión (coincide con el último release en GitHub).");
        }
      })
      .catch(() => {
        /* sin red o rate limit: sigue el flujo por electron-updater */
      });

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
        toast.dismiss(CHECK_UPDATE_TOAST_ID);
        setRemoteVersion(info.version);
        setPhase("available");
        setDownloadPercent(null);
        toast.loading(`Nueva versión ${info.version}. Descargando…`, {
          id: PROGRESS_TOAST_ID,
          duration: Infinity,
        });
      },
      onUpdateNotAvailable: () => {
        toast.dismiss(CHECK_UPDATE_TOAST_ID);
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
        toast.dismiss(CHECK_UPDATE_TOAST_ID);
        toast.dismiss(PROGRESS_TOAST_ID);
        setPhase("idle");
        setDownloadPercent(null);
        toast.error(`Error de actualización: ${msg}`);
      },
    });
  }, [installUpdate]);

  useEffect(() => {
    if (phase !== "checking") return;
    const t = window.setTimeout(() => {
      manualCheckPendingRef.current = false;
      toast.dismiss(CHECK_UPDATE_TOAST_ID);
      setPhase((prev) => (prev === "checking" ? "idle" : prev));
      toast.message("No hubo respuesta a tiempo", {
        description:
          "Comprobá tu conexión o probá de nuevo. Si ya estás actualizado, podés ignorar este aviso.",
      });
    }, 45_000);
    return () => window.clearTimeout(t);
  }, [phase]);

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
