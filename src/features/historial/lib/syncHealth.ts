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
}

export function resolveSyncHealth(input: SyncHealthInput): SyncHealth {
  const { pendingUpload, blocked, pendingDownload } = input;

  if (blocked > 0) {
    return { label: "Bloqueado", tone: "blocked", detail: `${blocked} operación(es) requieren intervención` };
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
