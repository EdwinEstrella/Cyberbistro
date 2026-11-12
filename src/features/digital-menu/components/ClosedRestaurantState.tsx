import { RESTAURANT_CLOSED_MESSAGE, RETRY_BUTTON_LABEL } from "../lib/onlineStatus";
import { publicMenuTheme } from "./public-app/publicMenuTheme";

interface ClosedRestaurantStateProps {
  title?: string | null;
  logoUrl?: string | null;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function ClosedRestaurantState({
  title,
  logoUrl,
  onRetry,
  isRetrying = false,
}: ClosedRestaurantStateProps) {
  return (
    <div className={publicMenuTheme.canvas} style={publicMenuTheme.rootStyle}>
      <div
        className={`${publicMenuTheme.deviceColumn} items-center justify-center p-6 text-center`}
        style={publicMenuTheme.rootStyle}
      >
        <div className="w-full rounded-2xl border border-[#27272a] bg-[#111113] p-7 shadow-2xl">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={title ? `Logo de ${title}` : "Logo"}
              className="mx-auto size-20 rounded-2xl object-contain bg-[#18181b] border border-[#27272a] p-2 mb-4"
            />
          ) : (
            <div className="mx-auto size-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 grid place-items-center mb-4">
              <span className="text-3xl" role="img" aria-label="Restaurante cerrado">
                🕒
              </span>
            </div>
          )}
          {title && <h1 className="text-xl font-bold text-white mb-2">{title}</h1>}
          <p className="text-xs text-zinc-400 leading-relaxed mb-6">
            {RESTAURANT_CLOSED_MESSAGE}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-98"
          >
            {isRetrying ? "Verificando..." : RETRY_BUTTON_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
