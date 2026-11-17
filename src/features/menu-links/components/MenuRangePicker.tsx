import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "../../../shared/ui/utils";
import { DatePicker, parseYMD, formatYMD } from "../../../shared/ui/date-picker";
import { addDays, getMondayOfWeek } from "../lib/menuSchedule";
import { formatMenuRangeSummary } from "../lib/menuRange";

export interface MenuRangePickerProps {
  weekStart: string;
  desde: string;
  hasta: string;
  onDesdeChange: (newDesde: string) => void;
  onHastaChange: (newHasta: string) => void;
  disabled?: boolean;
  className?: string;
}

export function MenuRangePicker({
  weekStart,
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
  disabled = false,
  className,
}: MenuRangePickerProps) {
  const monday = React.useMemo(
    () => getMondayOfWeek(weekStart || desde),
    [weekStart, desde]
  );
  const sunday = React.useMemo(() => addDays(monday, 6), [monday]);

  const desdeDate = React.useMemo(() => parseYMD(desde), [desde]);
  const sundayDate = React.useMemo(() => parseYMD(sunday), [sunday]);

  const disabledHastaDays = React.useCallback(
    (date: Date) => {
      const ymd = formatYMD(date);
      return ymd < desde || ymd > sunday;
    },
    [desde, sunday]
  );

  const highlightRange = React.useMemo(
    () => ({ from: desde, to: hasta }),
    [desde, hasta]
  );

  const summary = React.useMemo(
    () => formatMenuRangeSummary(desde, hasta),
    [desde, hasta]
  );

  return (
    <div className={cn("flex flex-col gap-2.5 animate-in fade-in duration-150", className)}>
      <div className="grid grid-cols-2 gap-2">
        {/* Desde picker */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <label
            htmlFor="menu-range-desde"
            className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
          >
            Desde
          </label>
          <DatePicker
            id="menu-range-desde"
            aria-label="Desde"
            value={desde}
            onChange={(selected) => {
              if (selected) {
                onDesdeChange(selected);
              }
            }}
            highlightRange={highlightRange}
            disabled={disabled}
          />
        </div>

        {/* Hasta picker */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <label
            htmlFor="menu-range-hasta"
            className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
          >
            Hasta
          </label>
          <DatePicker
            id="menu-range-hasta"
            aria-label="Hasta"
            value={hasta}
            onChange={(selected) => {
              if (selected) {
                onHastaChange(selected);
              }
            }}
            minDate={desdeDate}
            maxDate={sundayDate}
            disabledDays={disabledHastaDays}
            highlightRange={highlightRange}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center gap-2">
        <div className="px-3 py-1.5 rounded-xl bg-muted/40 border border-border text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
          <CalendarIcon className="size-3.5 text-primary shrink-0 opacity-80" />
          <span>{summary}</span>
        </div>
      </div>
    </div>
  );
}
