import type { AppUpdatePhase } from "./AppUpdateContext";

export type UpdateButtonTone = "neutral" | "accent";

export interface UpdateButtonState {
  /** Text shown next to the icon, or null for icon only. */
  label: string | null;
  tone: UpdateButtonTone;
  spinning: boolean;
  /** Pulsing dot signalling a pending update. */
  showDot: boolean;
  title: string;
}

/** Visual state of the title bar update button for a given update phase. */
export function getUpdateButtonState(args: {
  phase: AppUpdatePhase;
  downloadPercent: number | null;
  hasAlert: boolean;
}): UpdateButtonState {
  const { phase, downloadPercent, hasAlert } = args;
  if (phase === "checking") {
    return { label: null, tone: "neutral", spinning: true, showDot: false, title: "Buscando actualizaciones..." };
  }
  if (phase === "downloading") {
    const pct = Math.max(0, Math.min(100, Math.round(downloadPercent ?? 0)));
    return { label: `${pct}%`, tone: "accent", spinning: false, showDot: false, title: `Descargando actualización (${pct}%)` };
  }
  if (phase === "ready") {
    return { label: "Instalar", tone: "accent", spinning: false, showDot: true, title: "Actualización lista para instalar" };
  }
  if (hasAlert) {
    return { label: null, tone: "accent", spinning: false, showDot: true, title: "Hay una actualización de la app" };
  }
  return { label: null, tone: "neutral", spinning: false, showDot: false, title: "Buscar actualizaciones" };
}
