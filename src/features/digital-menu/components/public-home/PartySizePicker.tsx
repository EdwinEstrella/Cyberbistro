import { useState, useEffect } from "react";

export interface PartySizePickerProps {
  value: number | null;
  onChange: (size: number) => void;
}

const PRESET_SIZES = [1, 2, 3, 4, 5, 6] as const;
const MIN_STEPPER_VALUE = 7;
const MAX_STEPPER_VALUE = 99;

export function PartySizePicker({ value, onChange }: PartySizePickerProps) {
  const isCustomOpen = value !== null && value >= MIN_STEPPER_VALUE;
  const [stepperOpen, setStepperOpen] = useState(isCustomOpen);

  useEffect(() => {
    if (value !== null && value >= MIN_STEPPER_VALUE) {
      setStepperOpen(true);
    } else if (value !== null && value < MIN_STEPPER_VALUE) {
      setStepperOpen(false);
    }
  }, [value]);

  const handlePresetClick = (size: number) => {
    setStepperOpen(false);
    onChange(size);
  };

  const handlePlusClick = () => {
    setStepperOpen(true);
    if (value === null || value < MIN_STEPPER_VALUE) {
      onChange(MIN_STEPPER_VALUE);
    }
  };

  const handleDecrement = () => {
    const current = value ?? MIN_STEPPER_VALUE;
    if (current > MIN_STEPPER_VALUE) {
      onChange(current - 1);
    }
  };

  const handleIncrement = () => {
    const current = value ?? MIN_STEPPER_VALUE;
    if (current < MAX_STEPPER_VALUE) {
      onChange(current + 1);
    }
  };

  return (
    <section aria-labelledby="party-size-heading" className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="party-size-heading" className="text-sm font-bold text-white">
          ¿Cuántos son?
        </h2>
        {value !== null && (
          <span className="text-xs font-semibold text-emerald-400">
            {value} {value === 1 ? "persona" : "personas"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {PRESET_SIZES.map((size) => {
          const isSelected = value === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => handlePresetClick(size)}
              aria-label={`${size} ${size === 1 ? "persona" : "personas"}`}
              aria-pressed={isSelected}
              className={`flex h-12 w-full min-h-12 min-w-12 items-center justify-center rounded-2xl border text-base font-bold transition cursor-pointer select-none ${
                isSelected
                  ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-400/20"
                  : "border-[#27272a] bg-[#18181b] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95"
              }`}
            >
              {size}
            </button>
          );
        })}

        <button
          type="button"
          onClick={handlePlusClick}
          aria-label="Más de 6 personas"
          aria-pressed={stepperOpen}
          className={`flex h-12 w-full min-h-12 min-w-12 items-center justify-center rounded-2xl border text-lg font-bold transition cursor-pointer select-none ${
            stepperOpen
              ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-400/20"
              : "border-[#27272a] bg-[#18181b] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95"
          }`}
        >
          +
        </button>
      </div>

      {stepperOpen && (
        <div
          data-testid="stepper-panel"
          className="flex items-center justify-between rounded-2xl border border-[#27272a] bg-[#18181b] p-3 text-xs"
        >
          <div className="flex flex-col">
            <span className="font-semibold text-white">Grupo grande (7 - 99):</span>
            <span className="text-[11px] text-zinc-400">Usá los botones para ajustar</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={(value ?? MIN_STEPPER_VALUE) <= MIN_STEPPER_VALUE}
              aria-label="Disminuir comensales"
              className="flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-lg font-black text-zinc-200 transition hover:bg-zinc-800 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              −
            </button>

            <span
              data-testid="stepper-value"
              className="w-9 text-center text-base font-black text-white"
            >
              {value ?? MIN_STEPPER_VALUE}
            </span>

            <button
              type="button"
              onClick={handleIncrement}
              disabled={(value ?? MIN_STEPPER_VALUE) >= MAX_STEPPER_VALUE}
              aria-label="Aumentar comensales"
              className="flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-lg font-black text-zinc-200 transition hover:bg-zinc-800 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
