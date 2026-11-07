import {
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Plus,
} from "lucide-react";
import type { Menu } from "../../../menu-links/lib/types";
import { formatWeekRange, isWeekPast } from "../../../menu-links/lib/menuSchedule";
import type { CreateCalendarMenuValues } from "../../hooks/usePublicMenuCalendar";
import { CreateCalendarMenuDialog } from "./CreateCalendarMenuDialog";

export interface PublicMenuCalendarSectionProps {
  assignedMenu?: Menu | null;
  menus: Menu[];
  selectedCalendarMenuId: string;
  onSelectedCalendarMenuIdChange: (id: string) => void;
  updatingCalendar: boolean;
  hasSettingsId: boolean;
  onAssignCalendar: () => void;
  onRemoveCalendar: () => void;
  onEditCalendar: (menuId: string) => void;
  showCreateMenu: boolean;
  onOpenCreateMenu: () => void;
  onCloseCreateMenu: () => void;
  creatingMenu: boolean;
  onCreateAndAssignMenu: (values: CreateCalendarMenuValues) => void | Promise<void>;
}

export function PublicMenuCalendarSection({
  assignedMenu,
  menus,
  selectedCalendarMenuId,
  onSelectedCalendarMenuIdChange,
  updatingCalendar,
  hasSettingsId,
  onAssignCalendar,
  onRemoveCalendar,
  onEditCalendar,
  showCreateMenu,
  onOpenCreateMenu,
  onCloseCreateMenu,
  creatingMenu,
  onCreateAndAssignMenu,
}: PublicMenuCalendarSectionProps) {
  return (
    <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-4 text-primary" />
            <h3 className="font-['Space_Grotesk'] text-base font-bold text-foreground">
              Calendario del Menú Público
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Asigna un menú por días (recurrente o semanal) para que la carta se actualice automáticamente según el día de hoy.
          </p>
        </div>

        {assignedMenu && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 shrink-0">
            <CheckCircle2 className="size-3.5" />
            Calendario Activo
          </span>
        )}
      </div>

      {/* If a calendar menu is currently assigned */}
      {assignedMenu ? (
        <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-sm text-foreground">
                {assignedMenu.name}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarIcon className="size-3 text-muted-foreground" />
                  {assignedMenu.schedule_mode === "weekly"
                    ? assignedMenu.week_start
                      ? formatWeekRange(assignedMenu.week_start)
                      : "Semanal"
                    : "Recurrente semanal"}
                </span>
                {assignedMenu.schedule_mode === "weekly" &&
                  assignedMenu.week_start &&
                  isWeekPast(assignedMenu.week_start) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <AlertTriangle className="size-3" />
                      Semana vencida
                    </span>
                  )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEditCalendar(assignedMenu.id)}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <Edit3 className="size-3.5" />
                Editar calendario
              </button>
              <button
                type="button"
                disabled={updatingCalendar || !hasSettingsId}
                onClick={onRemoveCalendar}
                className="py-1.5 px-3 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-destructive text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={!hasSettingsId ? "Guarda primero la configuración del menú público antes de asignar un calendario." : "Volver a la lista de platos tradicional"}
              >
                Quitar calendario
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs">
            <p>
              El menú público muestra hoy los platos programados en <strong>{assignedMenu.name}</strong> para el día actual.
              Si quitas el calendario, el menú público volverá a mostrar la lista completa de platos visibles configurados abajo.
            </p>
          </div>
        </div>
      ) : (
        /* No calendar menu assigned */
        <div className="flex flex-col gap-3">
          {!hasSettingsId ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs leading-relaxed">
              <span className="font-bold">Aviso:</span> Guarda primero la configuración del menú público antes de asignar un calendario.
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs leading-relaxed">
              <span className="font-bold">Modo lista visible:</span> Sin un calendario asignado, el menú público muestra la lista completa de platos visibles configurados abajo.
            </div>
          )}

          {/* Switch between select existing or create new menu */}
          <div className="flex flex-col gap-3 mt-1">
            {!showCreateMenu ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={selectedCalendarMenuId}
                  onChange={(e) => onSelectedCalendarMenuIdChange(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                >
                  {menus.length === 0 ? (
                    <option value="">No hay menús creados</option>
                  ) : (
                    menus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.schedule_mode === "weekly" ? "Semanal" : "Recurrente"})
                      </option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  disabled={updatingCalendar || !selectedCalendarMenuId || menus.length === 0 || !hasSettingsId}
                  onClick={onAssignCalendar}
                  title={!hasSettingsId ? "Guarda primero la configuración del menú público antes de asignar un calendario." : undefined}
                  className="py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm shrink-0"
                >
                  {updatingCalendar ? "Asignando..." : "Asignar calendario"}
                </button>

                <button
                  type="button"
                  disabled={!hasSettingsId}
                  onClick={onOpenCreateMenu}
                  title={!hasSettingsId ? "Guarda primero la configuración del menú público antes de asignar un calendario." : undefined}
                  className="py-2 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="size-3.5" />
                  Crear menú
                </button>
              </div>
            ) : (
              <CreateCalendarMenuDialog
                creatingMenu={creatingMenu}
                hasSettingsId={hasSettingsId}
                onClose={onCloseCreateMenu}
                onSubmit={onCreateAndAssignMenu}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
