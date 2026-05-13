import type { LocalFirstStatus } from "../lib/localFirst";

interface LocalFirstStatusBadgeProps {
  status: LocalFirstStatus;
  message: string;
  completedHistoryTables: number;
  totalHistoryTables: number;
}

function labelForStatus(status: LocalFirstStatus): string {
  switch (status) {
    case "bootstrapping_minimum":
      return "Bootstrap local";
    case "ready_history_syncing":
      return "Historial sincronizando";
    case "history_complete":
      return "Historial offline listo";
    case "offline":
      return "Offline";
    case "syncing":
      return "Sincronizando";
    case "error":
      return "Sync con error";
    default:
      return "Local-first";
  }
}

function colorForStatus(status: LocalFirstStatus): string {
  if (status === "history_complete") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
  if (status === "error" || status === "offline") return "bg-orange-500/10 text-orange-300 border-orange-500/25";
  return "bg-sky-500/10 text-sky-300 border-sky-500/25";
}

export function LocalFirstStatusBadge({
  status,
  message,
  completedHistoryTables,
  totalHistoryTables,
}: LocalFirstStatusBadgeProps) {
  if (status === "idle") return null;

  const progress = totalHistoryTables > 0 ? `${completedHistoryTables}/${totalHistoryTables}` : "0/0";

  return (
    <div
      className={`rounded-[8px] border px-3 py-2 font-['Inter',sans-serif] text-[11px] leading-tight ${colorForStatus(status)}`}
      role={status === "error" ? "alert" : "status"}
      title={message}
    >
      <div className="font-bold uppercase tracking-[0.08em]">{labelForStatus(status)}</div>
      <div className="mt-1 text-current/75">Historial {progress}</div>
    </div>
  );
}
