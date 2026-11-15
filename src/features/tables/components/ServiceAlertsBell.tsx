import { useState, useEffect, useRef } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import {
  describeServiceAlert,
  formatWaitTime,
  type ServiceAlert,
} from "../lib/serviceAlerts";

export interface ServiceAlertsBellProps {
  alerts: ServiceAlert[];
  attendingId: string | null;
  error: string | null;
  now: Date;
  onAttend: (id: string) => void;
  defaultOpen?: boolean;
}

export function ServiceAlertsBell({
  alerts,
  attendingId,
  error,
  now,
  onAttend,
  defaultOpen = false,
}: ServiceAlertsBellProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const hasAlerts = alerts.length > 0;

  return (
    <div ref={panelRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Solicitudes de mesas"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`relative p-2 rounded-full border transition-colors cursor-pointer flex items-center justify-center ${
          hasAlerts
            ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
            : "bg-muted/30 border-black/5 dark:border-white/5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        {hasAlerts ? (
          <BellRing className="size-4 motion-safe:animate-pulse motion-reduce:animate-none" />
        ) : (
          <Bell className="size-4" />
        )}

        {hasAlerts && (
          <span
            data-testid="service-alerts-badge"
            className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-black rounded-full h-4 min-w-4 px-1 flex items-center justify-center tabular-nums leading-none shadow-sm motion-safe:animate-pulse motion-reduce:animate-none"
          >
            {alerts.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Solicitudes de mesas"
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-4 z-50 flex flex-col gap-3 font-['Space_Grotesk']"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Solicitudes de mesas
              </h3>
              {hasAlerts && (
                <span className="text-[10px] font-bold bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full tabular-nums">
                  {alerts.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none cursor-pointer bg-transparent border-none p-1"
              aria-label="Cerrar panel"
            >
              ×
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl p-2.5 leading-tight font-sans"
            >
              {error}
            </div>
          )}

          {alerts.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">
              No hay solicitudes pendientes
            </p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {alerts.map((alert) => {
                const { title, subtitle } = describeServiceAlert(alert);
                const waitTime = formatWaitTime(alert.createdAt, now);
                const isAttending = attendingId === alert.id;

                return (
                  <li
                    key={alert.id}
                    className="bg-muted/30 border border-border/50 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground truncate">
                          {title}
                        </span>
                        {waitTime ? (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 font-sans">
                            {waitTime}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-sans">
                        {subtitle}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAttend(alert.id)}
                      disabled={attendingId !== null}
                      className="shrink-0 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none flex items-center gap-1 shadow-sm"
                    >
                      {isAttending ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Atendiendo...</span>
                        </>
                      ) : (
                        <span>Atender</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
