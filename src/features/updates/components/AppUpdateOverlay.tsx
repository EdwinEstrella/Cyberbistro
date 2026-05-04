import { useAppUpdate } from "../AppUpdateContext";

export function AppUpdateOverlay() {
  const {
    phase,
    remoteVersion,
    downloadPercent,
    errorDetail,
    isUpdateCardVisible,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    closeUpdateCard,
  } = useAppUpdate();

  if (!isUpdateCardVisible) return null;

  const v = remoteVersion ? `v${remoteVersion}` : "nueva versión";

  let title = "";
  let meta = "";
  let primaryLabel = "";
  let secondaryLabel = "";
  let primaryDisabled = false;
  let showProgress = false;
  let progress = Math.max(0, Math.min(100, Number(downloadPercent) || 0));

  if (phase === "available") {
    title = `Hay una actualización (${v})`;
    meta = "Se detectó una nueva versión. Si aceptas, inicia la descarga en segundo plano.";
    primaryLabel = "Aceptar";
    secondaryLabel = "Más tarde";
  } else if (phase === "downloading") {
    title = `Descargando ${v}`;
    meta = `Progreso ${Math.round(progress)}%. Puedes seguir usando la app.`;
    primaryLabel = "Descargando…";
    secondaryLabel = "Ocultar";
    primaryDisabled = true;
    showProgress = true;
  } else if (phase === "ready") {
    title = `Listo para actualizar (${v})`;
    meta = "La actualización ya se descargó. No volverá a descargarse al abrir de nuevo.";
    primaryLabel = "Actualizar ahora";
    secondaryLabel = "Después";
    showProgress = true;
    progress = 100;
  } else if (phase === "error") {
    title = "No se pudo actualizar";
    const shortDetail = String(errorDetail || "").trim().slice(0, 220);
    meta = shortDetail
      ? `Hubo un problema al buscar o descargar la actualización. Detalle: ${shortDetail}`
      : "Hubo un problema al buscar o descargar la actualización.";
    primaryLabel = "Reintentar";
    secondaryLabel = "Cerrar";
  } else {
    return null;
  }

  const onPrimary = () => {
    if (phase === "available") {
      downloadUpdate();
      return;
    }
    if (phase === "ready") {
      installUpdate();
      return;
    }
    if (phase === "error") {
      closeUpdateCard();
      checkForUpdates();
    }
  };

  const onSecondary = () => {
    closeUpdateCard();
  };

  return (
    <aside
      aria-live="polite"
      aria-label="Actualizaciones de la aplicación"
      className="fixed bottom-6 right-6 z-[80] w-[320px] rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-6 shadow-2xl backdrop-blur-[8px] animate-in slide-in-from-right-4 transition-colors duration-300"
    >
      <div className="font-['Space_Grotesk'] font-bold text-[16px] text-foreground">
        {title}
      </div>
      <div className="mt-2 font-['Inter'] text-[12px] leading-relaxed text-muted-foreground">
        {meta}
      </div>

      {showProgress && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onSecondary}
          className="rounded-xl px-4 py-2 font-['Inter'] font-bold text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all border-none bg-transparent cursor-pointer"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="rounded-xl bg-primary px-5 py-2 font-['Inter'] font-bold text-[11px] uppercase tracking-widest text-primary-foreground shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all border-none cursor-pointer"
        >
          {primaryLabel}
        </button>
      </div>
    </aside>
  );
}
