import React, { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "../../../../shared/ui/date-picker";
import { getMondayOfWeek } from "../../../menu-links/lib/menuSchedule";
import { getBusinessToday } from "../../../menu-links/lib/menuBusinessDate";
import type { CreateCalendarMenuValues } from "../../hooks/usePublicMenuCalendar";

export interface CreateCalendarMenuDialogProps {
  creatingMenu: boolean;
  hasSettingsId: boolean;
  onClose: () => void;
  onSubmit: (values: CreateCalendarMenuValues) => void | Promise<void>;
}

export function CreateCalendarMenuDialog({
  creatingMenu,
  hasSettingsId,
  onClose,
  onSubmit,
}: CreateCalendarMenuDialogProps) {
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuMode, setNewMenuMode] = useState<"recurring" | "weekly">("recurring");
  const [newMenuWeekStart, setNewMenuWeekStart] = useState<string>(
    getMondayOfWeek(getBusinessToday())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenuName.trim()) {
      toast.error("El nombre del nuevo menú es obligatorio.");
      return;
    }
    void onSubmit({
      name: newMenuName.trim(),
      mode: newMenuMode,
      weekStart: newMenuMode === "weekly" ? newMenuWeekStart : "",
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
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
          onChange={(e) => setNewMenuName(e.target.value)}
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
            onClick={() => setNewMenuMode("recurring")}
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
            onClick={() => setNewMenuMode("weekly")}
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
              setNewMenuWeekStart(date ? getMondayOfWeek(date) : "")
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
          title={
            !hasSettingsId
              ? "Guarda primero la configuración del menú público antes de asignar un calendario."
              : undefined
          }
          className="py-1.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
        >
          {creatingMenu ? "Creando..." : "Crear y asignar"}
        </button>
      </div>
    </form>
  );
}
