export type SyncHealthTone = "healthy" | "attention" | "blocked" | "unknown";

export type SyncHealth = {
  label: string;
  tone: SyncHealthTone;
  detail: string;
};

export interface SyncHealthInput {
  /** Rows waiting to upload (SQLite outbox pending/syncing). */
  pendingUpload: number;
  /** Operations that require manual intervention. */
  blocked: number;
  /**
   * Rows the cloud has that local does not (cloud − local), or `null` when the
   * download side has NOT been verified against the cloud yet. The health MUST
   * NOT claim full cloud sync while this is null: "al día con la nube" is a claim
   * about both directions, so it can only be made after the cloud was checked.
   */
  pendingDownload: number | null;
  /** Tables whose last cloud->local apply failed (recorded by the pull). */
  pullErrorTables?: number;
  /** True when the global pull has never completed on this device. */
  pullNeverCompleted?: boolean;
  /** True when the cloud is reachable (a never-completed pull only matters online). */
  online?: boolean;
}

export function resolveSyncHealth(input: SyncHealthInput): SyncHealth {
  const { pendingUpload, blocked, pendingDownload } = input;

  if (blocked > 0) {
    return { label: "Bloqueado", tone: "blocked", detail: `${blocked} operación(es) requieren intervención` };
  }

  const pullErrorTables = input.pullErrorTables ?? 0;
  if (pullErrorTables > 0) {
    return { label: "Bajada con errores", tone: "blocked", detail: `${pullErrorTables} tabla(s) no pudieron bajar de la nube` };
  }
  if (input.pullNeverCompleted && input.online) {
    return { label: "Bajada nunca completada", tone: "attention", detail: "La nube responde pero esta PC jamás completó una bajada" };
  }

  const hasDownloadPending = typeof pendingDownload === "number" && pendingDownload > 0;
  if (pendingUpload > 0 && hasDownloadPending) {
    return { label: "Desincronizado", tone: "attention", detail: `${pendingUpload} por subir · ${pendingDownload} por bajar` };
  }
  if (pendingUpload > 0) {
    return { label: "Subida pendiente", tone: "attention", detail: `${pendingUpload} operación(es) esperando subida` };
  }
  if (hasDownloadPending) {
    return { label: "Bajada pendiente", tone: "attention", detail: `${pendingDownload} fila(s) esperando bajar de la nube` };
  }

  // Upload side is clean, but the cloud has not been checked: we cannot honestly
  // claim "al día con la nube" without having looked at the nube.
  if (pendingDownload === null) {
    return { label: "Bajada sin verificar", tone: "unknown", detail: "Subida al día; falta comparar con la nube" };
  }

  return { label: "100% Saludable", tone: "healthy", detail: "Local y nube al día (verificado)" };
}
