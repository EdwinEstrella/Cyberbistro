import { useState } from "react";
import { Ban, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { CatalogDish } from "../lib/types";
import { getBusinessToday } from "../lib/menuBusinessDate";
import { togglePlatoSoldOut, normalizeRepoError } from "../lib/menuLinksRepo";

interface SoldOutTodayPanelProps {
  tenantId: string;
  dishesToday: Array<{ plato: CatalogDish; displayName?: string | null }>;
  soldOutPlatoIds: Set<number>;
  onToggleSoldOut: (platoId: number, isSoldOut: boolean) => void;
}

export function SoldOutTodayPanel({
  tenantId,
  dishesToday,
  soldOutPlatoIds,
  onToggleSoldOut,
}: SoldOutTodayPanelProps) {
  const businessToday = getBusinessToday();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleToggle = async (platoId: number, currentSoldOut: boolean) => {
    const nextSoldOut = !currentSoldOut;
    setUpdatingId(platoId);
    onToggleSoldOut(platoId, nextSoldOut);

    try {
      await togglePlatoSoldOut(tenantId, platoId, businessToday, nextSoldOut);
      toast.success(
        nextSoldOut
          ? "Plato marcado como agotado para hoy"
          : "Plato disponible nuevamente para hoy"
      );
    } catch (err) {
      // Revert on error
      onToggleSoldOut(platoId, currentSoldOut);
      const normalized = normalizeRepoError(err, "No se pudo actualizar el estado de agotado.");
      toast.error(normalized.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const [year, month, day] = businessToday.split("-");
  const formattedToday = `${day}/${month}/${year}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-['Space_Grotesk'] text-foreground">
              Agotado hoy ({formattedToday})
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Control rápido de disponibilidad para el servicio de hoy (hora de Santo Domingo).
            </p>
          </div>
        </div>
        <div className="text-[11px] font-semibold text-muted-foreground">
          {dishesToday.length} plato{dishesToday.length === 1 ? "" : "s"} programado{dishesToday.length === 1 ? "" : "s"} hoy
        </div>
      </div>

      {dishesToday.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center bg-muted/20 rounded-xl border border-dashed border-border">
          No hay platos programados en este menú para el día de hoy.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
          {dishesToday.map(({ plato, displayName }) => {
            const isSoldOut = soldOutPlatoIds.has(plato.id);
            const isBusy = updatingId === plato.id;

            return (
              <div
                key={plato.id}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                  isSoldOut
                    ? "bg-destructive/5 border-destructive/20 text-muted-foreground"
                    : "bg-muted/30 border-border text-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className={`text-xs font-bold truncate ${isSoldOut ? "line-through opacity-70" : ""}`}>
                    {displayName || plato.nombre}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {plato.categoria}
                    {plato.is_extra && (
                      <span className="text-primary font-semibold">· Extra</span>
                    )}
                  </span>
                </div>

                <button
                  onClick={() => handleToggle(plato.id, isSoldOut)}
                  disabled={isBusy}
                  className={`shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer border ${
                    isSoldOut
                      ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={isSoldOut ? "Marcar como disponible" : "Marcar como agotado hoy"}
                >
                  {isSoldOut ? (
                    <>
                      <Ban className="size-3" />
                      Agotado
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3 text-green-500" />
                      Disponible
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
