import { BellRing, Receipt } from "lucide-react";

export interface ServiceRequestButtonsProps {
  waiterAvailable: boolean | null;
  onRequestWaiter: () => void;
  onRequestBill: () => void;
}

export const WAITER_UNAVAILABLE_HINT =
  "No hay meseros conectados ahora. Pedí la cuenta o avisá en caja.";

/**
 * Quick action buttons for in-table service requests ("Llamar al mesero" & "Pedir la cuenta").
 * Matches the visual design of UtilityButtonGrid.
 *
 * Rules:
 * - "Llamar al mesero" is disabled ONLY when waiterAvailable === false.
 * - When waiterAvailable === null (unknown/error), it remains ENABLED (fail open).
 * - "Pedir la cuenta" is never gated by presence.
 */
export function ServiceRequestButtons({
  waiterAvailable,
  onRequestWaiter,
  onRequestBill,
}: ServiceRequestButtonsProps) {
  const isWaiterDisabled = waiterAvailable === false;

  return (
    <section aria-label="Solicitudes de servicio" data-testid="service-request-buttons" className="w-full">
      <div className="grid grid-cols-2 gap-2.5">
        {/* Call waiter button */}
        <button
          type="button"
          data-testid="request-waiter-button"
          onClick={onRequestWaiter}
          disabled={isWaiterDisabled}
          aria-disabled={isWaiterDisabled}
          title={isWaiterDisabled ? WAITER_UNAVAILABLE_HINT : undefined}
          className={`flex min-h-[52px] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left transition select-none ${
            isWaiterDisabled
              ? "border-[#27272a]/60 bg-[#111113]/60 opacity-55 cursor-not-allowed"
              : "border-[#27272a] bg-[#111113] hover:bg-[#18181b] hover:border-zinc-700 active:scale-98 cursor-pointer group"
          }`}
        >
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl border transition ${
              isWaiterDisabled
                ? "bg-zinc-800/40 border-zinc-700/40 text-zinc-500"
                : "bg-emerald-400/10 border-emerald-400/20 text-emerald-400 group-hover:bg-emerald-400/20"
            }`}
          >
            <BellRing className="size-4.5" />
          </div>
          <span
            className={`text-xs font-semibold leading-tight line-clamp-2 transition ${
              isWaiterDisabled
                ? "text-zinc-500"
                : "text-white group-hover:text-emerald-300"
            }`}
          >
            Llamar al mesero
          </span>
        </button>

        {/* Request bill button */}
        <button
          type="button"
          data-testid="request-bill-button"
          onClick={onRequestBill}
          className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-[#27272a] bg-[#111113] px-3.5 py-2.5 text-left transition hover:bg-[#18181b] hover:border-zinc-700 active:scale-98 cursor-pointer select-none group"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 group-hover:bg-emerald-400/20 transition">
            <Receipt className="size-4.5" />
          </div>
          <span className="text-xs font-semibold leading-tight text-white group-hover:text-emerald-300 transition line-clamp-2">
            Pedir la cuenta
          </span>
        </button>
      </div>

      {isWaiterDisabled && (
        <p
          data-testid="waiter-unavailable-hint"
          className="mt-2 text-center text-[11px] font-medium text-zinc-400 leading-tight"
        >
          {WAITER_UNAVAILABLE_HINT}
        </p>
      )}
    </section>
  );
}
