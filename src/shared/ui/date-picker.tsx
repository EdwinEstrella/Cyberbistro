import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  minDate?: Date;
  maxDate?: Date;
}

function parseYMD(val?: string): Date | undefined {
  if (!val) return undefined;
  const parts = val.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 12, 0, 0);
    }
  }
  return undefined;
}

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = React.useMemo(() => parseYMD(value), [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange?.(formatYMD(date));
    } else {
      onChange?.("");
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-xl border border-input bg-input-background px-3 py-2 text-xs font-medium text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 hover:bg-accent/40",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="size-3.5 shrink-0 opacity-70 text-primary" />
            <span className="truncate">
              {selectedDate ? (
                format(selectedDate, "dd/MM/yyyy", { locale: es })
              ) : (
                placeholder
              )}
            </span>
          </div>
          {selectedDate && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              aria-label="Limpiar fecha"
              className="ml-1.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-muted transition-opacity"
            >
              <X className="size-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-2xl border-border bg-card shadow-xl" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          locale={es}
          fromDate={minDate}
          toDate={maxDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateTimePickerProps {
  value?: string; // YYYY-MM-DDTHH:mm
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha y hora",
  className,
  disabled = false,
  id,
  "aria-label": ariaLabel,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const { datePart, timePart } = React.useMemo(() => {
    if (!value) return { datePart: undefined, timePart: "12:00" };
    const [d, t] = value.split("T");
    return {
      datePart: parseYMD(d),
      timePart: t ? t.slice(0, 5) : "12:00",
    };
  }, [value]);

  const [currentTime, setCurrentTime] = React.useState<string>(timePart);

  React.useEffect(() => {
    setCurrentTime(timePart);
  }, [timePart]);

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) {
      onChange?.("");
      return;
    }
    const dStr = formatYMD(date);
    onChange?.(`${dStr}T${currentTime || "12:00"}`);
  };

  const handleTimeChange = (newTime: string) => {
    setCurrentTime(newTime);
    if (datePart) {
      onChange?.(`${formatYMD(datePart)}T${newTime}`);
    } else {
      const todayStr = formatYMD(new Date());
      onChange?.(`${todayStr}T${newTime}`);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-xl border border-input bg-input-background px-3 py-2 text-xs font-medium text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 hover:bg-accent/40",
            !value && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="size-3.5 shrink-0 opacity-70 text-primary" />
            <span className="truncate">
              {datePart ? (
                `${format(datePart, "dd/MM/yyyy", { locale: es })} ${timePart}`
              ) : (
                placeholder
              )}
            </span>
          </div>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              aria-label="Limpiar fecha"
              className="ml-1.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-muted transition-opacity"
            >
              <X className="size-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-2xl border-border bg-card shadow-xl" align="start">
        <Calendar
          mode="single"
          selected={datePart}
          onSelect={handleSelectDate}
          locale={es}
          initialFocus
        />
        <div className="border-t border-border p-3 flex items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Clock className="size-3.5 text-primary" />
            <span>Hora:</span>
          </div>
          <input
            type="time"
            value={currentTime}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground font-mono outline-none focus:border-primary"
          />
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 text-[11px] font-bold uppercase tracking-wider rounded-lg px-3"
            onClick={() => setOpen(false)}
          >
            Listo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
