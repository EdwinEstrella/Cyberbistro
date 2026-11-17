import { memo } from "react";
import type { CatalogDish, MenuDishDraft } from "../lib/types";

const WEEKDAYS = [
  { day: 1, label: "L", title: "Lunes" },
  { day: 2, label: "M", title: "Martes" },
  { day: 3, label: "X", title: "Miércoles" },
  { day: 4, label: "J", title: "Jueves" },
  { day: 5, label: "V", title: "Viernes" },
  { day: 6, label: "S", title: "Sábado" },
  { day: 7, label: "D", title: "Domingo" },
];

interface MenuDishRowProps {
  plato: CatalogDish;
  draft: MenuDishDraft;
  onChange: (updated: Partial<MenuDishDraft>) => void;
}

export const MenuDishRow = memo(function MenuDishRow({
  plato,
  draft,
  onChange,
}: MenuDishRowProps) {
  const toggleWeekday = (day: number) => {
    const current = new Set(draft.weekdays);
    if (current.has(day)) {
      if (current.size === 1) return; // Prevent empty weekdays
      current.delete(day);
    } else {
      current.add(day);
    }
    onChange({ weekdays: Array.from(current).sort((a, b) => a - b) });
  };

  return (
    <div
      className={`p-3 sm:p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        draft.included
          ? "bg-card border-primary/30 shadow-xs"
          : "bg-muted/20 border-border opacity-70 hover:opacity-100"
      }`}
    >
      {/* Inclusion checkbox + dish info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={draft.included}
            onChange={(e) => onChange({ included: e.target.checked })}
            className="size-4.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
          />
          <span className="text-xs font-bold text-foreground sm:hidden">
            {draft.included ? "En el menú" : "Fuera"}
          </span>
        </label>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs sm:text-sm font-bold truncate ${draft.included ? "text-foreground" : "text-muted-foreground"}`}>
              {plato.nombre}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5 rounded-md bg-muted/60">
              {plato.categoria}
            </span>
            {plato.is_extra && (
              <span className="text-[10px] font-bold text-primary px-1.5 py-0.2 rounded bg-primary/10 border border-primary/20">
                Extra
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            RD$ {Number(plato.precio || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* When included in menu: controls for display name, sort order, and weekday chips */}
      {draft.included && (
        <div className="w-full sm:w-auto flex flex-wrap items-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60 animate-in fade-in duration-150">
          {/* Custom display name */}
          <div className="flex-1 sm:w-44">
            <input
              type="text"
              value={draft.display_name}
              onChange={(e) => onChange({ display_name: e.target.value })}
              placeholder={plato.nombre}
              title="Nombre personalizado en este menú (opcional)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Sort order */}
          <div className="flex items-center gap-1.5 shrink-0" title="Orden de visualización">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Orden</span>
            <input
              type="number"
              min="0"
              max="999"
              value={draft.sort_order}
              onChange={(e) => onChange({ sort_order: parseInt(e.target.value, 10) || 0 })}
              className="w-14 px-2 py-1.5 rounded-lg bg-muted/60 border border-border text-foreground text-xs text-center font-mono focus:outline-none focus:border-primary"
            />
          </div>

          {/* Weekday chips */}
          <div className="flex items-center gap-1 shrink-0">
            {WEEKDAYS.map(({ day, label, title }) => {
              const active = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  title={`${title} (${active ? "Incluido" : "No incluido"})`}
                  className={`size-7 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center border ${
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
