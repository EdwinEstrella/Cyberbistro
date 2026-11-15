import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CheckCircle2, LocateFixed, Store, Truck } from "lucide-react";
import { DELIVERY_REFERENCE_MAX, isValidCoordinatePair, type DeliveryDraft, type DeliveryMode } from "../../lib/deliveryOrder";
import { locateCustomer } from "../../lib/locateCustomer";

const DeliveryMapPicker = lazy(() => import("./DeliveryMapPicker"));

export interface DeliveryPickerProps {
  value: DeliveryDraft;
  onChange: (next: DeliveryDraft) => void;
}

const MODES: { id: DeliveryMode; label: string; Icon: typeof Store }[] = [
  { id: "pickup", label: "Recoger en el local", Icon: Store },
  { id: "delivery", label: "Entrega a domicilio", Icon: Truck },
];

/**
 * Pickup / home-delivery choice for public takeout orders. Mobile first: every control is at least 44px tall and
 * the map is a fixed-height block that fills the drawer width.
 */
export function DeliveryPicker({ value, onChange }: DeliveryPickerProps) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isDelivery = value.mode === "delivery";
  const hasPin = isValidCoordinatePair(value.lat, value.lng);

  async function handleUseMyLocation() {
    setLocating(true);
    setLocationError(null);
    const result = await locateCustomer(value);
    if (!mountedRef.current) return;
    setLocating(false);
    if (result.error) setLocationError(result.error);
    else onChange(result.draft);
  }

  return (
    <div className="space-y-3" data-testid="delivery-picker">
      <div role="radiogroup" aria-label="Cómo quieres recibir tu pedido" className="grid grid-cols-2 gap-2">
        {MODES.map(({ id, label, Icon }) => {
          const selected = value.mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ ...value, mode: id })}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[11px] font-semibold leading-tight transition cursor-pointer active:scale-95 ${
                selected
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
                  : "border-[#27272a] bg-[#18181b] text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {isDelivery && (
        <div className="space-y-3 rounded-xl border border-[#27272a] bg-[#111113] p-3">
          <button
            type="button"
            onClick={() => void handleUseMyLocation()}
            disabled={locating}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-xs font-bold text-emerald-300 transition cursor-pointer active:scale-95 disabled:opacity-60"
          >
            <LocateFixed className={`size-4 ${locating ? "animate-pulse" : ""}`} aria-hidden="true" />
            {locating ? "Buscando tu ubicación…" : "Usar mi ubicación actual"}
          </button>

          {locationError && (
            <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">
              {locationError}
            </p>
          )}

          <p className="text-[11px] leading-snug text-zinc-500">
            O toca el mapa para marcar dónde te entregamos. Puedes arrastrar el pin para ajustarlo.
          </p>

          <Suspense
            fallback={<div className="h-56 w-full animate-pulse rounded-xl border border-[#27272a] bg-[#18181b]" />}
          >
            <DeliveryMapPicker
              lat={value.lat}
              lng={value.lng}
              onPick={(lat, lng) => {
                setLocationError(null);
                onChange({ ...value, lat, lng });
              }}
            />
          </Suspense>

          {hasPin && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Ubicación marcada
            </p>
          )}

          <textarea
            value={value.reference}
            onChange={(event) => onChange({ ...value, reference: event.target.value })}
            maxLength={DELIVERY_REFERENCE_MAX}
            rows={2}
            placeholder="Punto de referencia (ej. casa azul frente al colmado)"
            aria-label="Punto de referencia de la entrega"
            className="w-full resize-none rounded-xl border border-[#27272a] bg-[#18181b] px-3.5 py-2.5 text-base text-white placeholder:text-zinc-500 outline-none transition focus:border-emerald-400/50"
          />
        </div>
      )}
    </div>
  );
}
