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
      return "Preparando sistema";
    case "ready_history_syncing":
      return "Descargando historial";
    case "history_complete":
      return "Historial offline listo";
    case "offline":
      return "Modo sin internet";
    case "syncing":
      return "Sincronizando datos";
    case "error":
      return "Sync con problemas";
    default:
      return "Local-first";
  }
}

function statusTheme(status: LocalFirstStatus) {
  switch (status) {
    case "history_complete":
      return {
        bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
        dot: "bg-emerald-500",
        pulse: "bg-emerald-500/40",
        bar: "bg-emerald-500",
        animate: true,
      };
    case "offline":
    case "error":
      return {
        bg: "bg-amber-500/10 border-amber-500/20 text-amber-500 dark:text-amber-400",
        dot: "bg-amber-500",
        pulse: "bg-amber-500/40",
        bar: "bg-amber-500",
        animate: false,
      };
    case "syncing":
    case "ready_history_syncing":
    case "bootstrapping_minimum":
    default:
      return {
        bg: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400",
        dot: "bg-sky-500",
        pulse: "bg-sky-500/40",
        bar: "bg-sky-500",
        animate: true,
      };
  }
}

export function LocalFirstStatusBadge({
  status,
  message,
  completedHistoryTables,
  totalHistoryTables,
}: LocalFirstStatusBadgeProps) {
  if (status === "idle") return null;

  const theme = statusTheme(status);
  const percentage = totalHistoryTables > 0 ? (completedHistoryTables / totalHistoryTables) * 100 : 0;

  return (
    <div
      className={`rounded-xl border p-3 font-['Inter',sans-serif] text-[11px] leading-tight transition-all duration-300 flex flex-col gap-2.5 ${theme.bg}`}
      role={status === "error" ? "alert" : "status"}
      title={message}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Pulsing Status Dot */}
          <div className="relative flex size-2 shrink-0">
            {theme.animate && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${theme.pulse}`} />
            )}
            <span className={`relative inline-flex rounded-full size-2 ${theme.dot}`} />
          </div>
          <span className="font-bold uppercase tracking-wider text-[10px] truncate">
            {labelForStatus(status)}
          </span>
        </div>
        <span className="text-[9.5px] font-bold opacity-80 tabular-nums shrink-0">
          {completedHistoryTables}/{totalHistoryTables}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-black/5 dark:bg-white/10 h-1 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="text-[9.5px] opacity-75 font-medium truncate" title={message}>
        {message}
      </div>
    </div>
  );
}
