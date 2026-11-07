import React from "react";
import { X } from "lucide-react";
import { DatePicker } from "../../../../shared/ui/date-picker";
import { getMondayOfWeek } from "../../../menu-links/lib/menuSchedule";

export interface CreateCalendarMenuDialogProps {
  newMenuName: string;
  onNewMenuNameChange: (val: string) => void;
  newMenuMode: "recurring" | "weekly";
  onNewMenuModeChange: (val: "recurring" | "weekly") => void;
  newMenuWeekStart: string;
  onNewMenuWeekStartChange: (val: string) => void;
  creatingMenu: boolean;
  hasSettingsId: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CreateCalendarMenuDialog({
  newMenuName,
  onNewMenuNameChange,
  newMenuMode,
  onNewMenuModeChange,
  newMenuWeekStart,
  onNewMenuWeekStartChange,
  creatingMenu,
  hasSettingsId,
  onClose,
  onSubmit,
}: CreateCalendarMenuDialogProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col gap-3 animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">
          Crear nuevo menú para calendario
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-muted-foreground">
          Nombre del menú
        </label>
        <input
          type="text"
          required
          value={newMenuName}
          onChange={(e) => onNewMenuNameChange(e.target.value)}
          placeholder="Ej. Menú Ejecutivo Semanal"
          className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-muted-foreground">
          Tipo de horario
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onNewMenuModeChange("recurring")}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              newMenuMode === "recurring"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Recurrente semanal
          </button>
          <button
            type="button"
            onClick={() => onNewMenuModeChange("weekly")}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              newMenuMode === "weekly"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Semana específica
          </button>
        </div>
      </div>

      {newMenuMode === "weekly" && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-muted-foreground">
            Fecha de inicio de semana (normalizada a lunes)
          </label>
          <DatePicker
            value={newMenuWeekStart}
            onChange={(date) =>
              onNewMenuWeekStartChange(date ? getMondayOfWeek(date) : "")
            }
            placeholder="Seleccionar lunes"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={onClose}
          className="py-1.5 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={creatingMenu || !hasSettingsId}
          title={!hasSettingsId ? "Guarda primero la configuración del menú público antes de asignar un calendario." : undefined}
          className="py-1.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
        >
          {creatingMenu ? "Creando..." : "Crear y asignar"}
        </button>
      </div>
    </form>
  );
}
