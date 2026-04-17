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
    if (phase === "downloading" || phase === "ready") {
      closeUpdateCard();
      return;
    }
    closeUpdateCard();
  };

  return (
    <aside
      aria-live="polite"
      aria-label="Actualizaciones de la aplicación"
      className="fixed bottom-6 right-6 z-[80] w-[320px] rounded-[16px] border border-[rgba(72,72,71,0.25)] bg-[rgba(14,14,14,0.92)] p-[16px] shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-[8px]"
    >
      <div className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] text-[#f5f5f5]">
        {title}
      </div>
      <div className="mt-[8px] font-['Inter',sans-serif] text-[12px] leading-[18px] text-[#adaaaa]">
        {meta}
      </div>

      {showProgress ? (
        <div className="mt-[12px] h-[6px] w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
          <div
            className="h-full rounded-full bg-[#ff906d] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <div className="mt-[14px] flex items-center justify-end gap-[8px]">
        <button
          type="button"
          onClick={onSecondary}
          className="rounded-[10px] border border-[rgba(72,72,71,0.4)] bg-[#1a1a1a] px-[12px] py-[8px] font-['Inter',sans-serif] text-[12px] text-[#bdbdbd]"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="rounded-[10px] border border-[rgba(255,144,109,0.25)] bg-[#ff906d] px-[12px] py-[8px] font-['Inter',sans-serif] text-[12px] font-semibold text-[#2e1208] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {primaryLabel}
        </button>
      </div>
    </aside>
  );
}
