export type SyncHealth = {
  label: "100% Saludable" | "Atención" | "Bloqueado";
  tone: "healthy" | "attention" | "blocked";
};

export function resolveSyncHealth(pending: number, blocked: number): SyncHealth {
  if (blocked > 0) return { label: "Bloqueado", tone: "blocked" };
  if (pending > 0) return { label: "Atención", tone: "attention" };
  return { label: "100% Saludable", tone: "healthy" };
}
