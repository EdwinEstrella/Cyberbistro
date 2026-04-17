import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { UpdateInfoPayload, UpdateStatePayload } from "@/shared/types/electron";

export type AppUpdatePhase =
  | "idle"
  | "unsupported"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

type AppUpdateContextValue = {
  phase: AppUpdatePhase;
  remoteVersion: string | null;
  downloadPercent: number | null;
  errorDetail: string;
  isUpdateCardVisible: boolean;
  /** Campanita: hay actualización en curso o lista para instalar */
  hasUpdateBellAlert: boolean;
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
  showUpdateBellToast: () => void;
  openUpdateCard: () => void;
  closeUpdateCard: () => void;
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
  const [errorDetail, setErrorDetail] = useState("");
  const [isUpdateCardVisible, setIsUpdateCardVisible] = useState(false);

  const hasUpdateBellAlert =
    phase === "available" || phase === "downloading" || phase === "ready" || phase === "error";

  const setPhaseState = useCallback(
    (next: AppUpdatePhase, extra?: { version?: string | null; percent?: number | null; error?: string }) => {
      setPhase(next);
      if (extra?.version !== undefined) setRemoteVersion(extra.version);
      if (extra?.percent !== undefined) setDownloadPercent(extra.percent);
      if (extra?.error !== undefined) setErrorDetail(extra.error);
      if (next !== "error" && extra?.error === undefined) setErrorDetail("");
    },
    []
  );

  const installUpdate = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  const downloadUpdate = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.downloadUpdate) return;
    setPhaseState("downloading", { percent: downloadPercent ?? 0 });
    setIsUpdateCardVisible(true);
    api.downloadUpdate();
  }, [downloadPercent, setPhaseState]);

  const checkForUpdates = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.checkForUpdates) {
      toast.error("Las actualizaciones solo están disponibles en la app de escritorio.");
      return;
    }
    setPhaseState("checking", { percent: 0 });
    setIsUpdateCardVisible(false);
    api.checkForUpdates();
  }, [setPhaseState]);

  const showUpdateBellToast = useCallback(() => {
    if (!hasUpdateBellAlert) {
      toast.info("No hay actualizaciones pendientes en este momento.");
      return;
    }
    setIsUpdateCardVisible(true);
  }, [hasUpdateBellAlert]);

  const openUpdateCard = useCallback(() => {
    setIsUpdateCardVisible(true);
  }, []);

  const closeUpdateCard = useCallback(() => {
    setIsUpdateCardVisible(false);
  }, []);

  const hydrateFromState = useCallback(
    (state: UpdateStatePayload | null | undefined) => {
      if (!state) return;
      const phaseFromMain = state.phase === "unsupported" ? "idle" : state.phase;
      if (phaseFromMain === "ready") {
        setPhaseState("ready", {
          version: state.downloadedVersion ?? state.remoteVersion,
          percent: 100,
        });
      } else if (phaseFromMain === "downloading") {
        setPhaseState("downloading", {
          version: state.remoteVersion,
          percent: Number(state.percent) || 0,
        });
      } else if (phaseFromMain === "available") {
        setPhaseState("available", {
          version: state.remoteVersion,
          percent: 0,
        });
      } else if (phaseFromMain === "error") {
        setPhaseState("error", {
          version: state.remoteVersion,
          error: state.error || "",
        });
      } else {
        setPhaseState("idle", { percent: 0 });
      }
    },
    [setPhaseState]
  );

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateEvents) return;

    void api.getUpdateState?.().then((state) => hydrateFromState(state)).catch(() => {});

    return api.onUpdateEvents({
      onChecking: () => {
        setPhaseState("checking", { percent: 0 });
      },
      onUpdateAvailable: (info: UpdateInfoPayload) => {
        setPhaseState("available", {
          version: info?.version ?? remoteVersion,
          percent: 0,
        });
        setIsUpdateCardVisible(true);
      },
      onUpdateNotAvailable: () => {
        if (phase !== "ready" && phase !== "downloading") {
          setPhaseState("idle", { percent: 0 });
        }
      },
      onDownloadProgress: (p) => {
        setPhaseState("downloading", {
          percent: Number(p.percent) || 0,
        });
        setIsUpdateCardVisible(true);
      },
      onUpdateDownloaded: (info) => {
        setPhaseState("ready", {
          version: info?.version ?? remoteVersion,
          percent: 100,
        });
        setIsUpdateCardVisible(true);
      },
      onUpdateError: (payload) => {
        const detail =
          typeof payload === "string"
            ? payload.trim()
            : payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: string }).message ?? "").trim()
            : payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: string }).error ?? "").trim()
            : "";
        setPhase((prev) => {
          if (prev === "ready") return prev;
          return "error";
        });
        if (phase !== "ready") {
          setErrorDetail(detail);
          setIsUpdateCardVisible(true);
        }
      },
    });
  }, [hydrateFromState, phase, remoteVersion, setPhaseState]);

  const value = useMemo(
    () => ({
      phase,
      remoteVersion,
      downloadPercent,
      errorDetail,
      isUpdateCardVisible,
      hasUpdateBellAlert,
      checkForUpdates,
      downloadUpdate,
      installUpdate,
      showUpdateBellToast,
      openUpdateCard,
      closeUpdateCard,
    }),
    [
      phase,
      remoteVersion,
      downloadPercent,
      errorDetail,
      isUpdateCardVisible,
      hasUpdateBellAlert,
      checkForUpdates,
      downloadUpdate,
      installUpdate,
      showUpdateBellToast,
      openUpdateCard,
      closeUpdateCard,
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
