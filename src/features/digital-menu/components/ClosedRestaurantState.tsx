import { RESTAURANT_CLOSED_MESSAGE, RETRY_BUTTON_LABEL } from "../lib/onlineStatus";

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
    <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
      <div className="max-w-md w-full rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title ? `Logo de ${title}` : "Logo"}
            className="mx-auto size-20 rounded-2xl object-contain bg-white/10 p-2 mb-4"
          />
        ) : (
          <div className="mx-auto size-20 rounded-2xl bg-orange-300/10 border border-orange-400/20 grid place-items-center mb-4">
            <span className="text-3xl" role="img" aria-label="Restaurante cerrado">
              🕒
            </span>
          </div>
        )}
        {title && <h1 className="text-2xl font-black mb-2">{title}</h1>}
        <p className="text-sm text-orange-100/80 leading-relaxed mb-6">
          {RESTAURANT_CLOSED_MESSAGE}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="w-full rounded-2xl bg-[#ff906d] px-5 py-3.5 text-sm font-black uppercase tracking-wider text-[#24120b] hover:bg-[#ff825b] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRetrying ? "Verificando..." : RETRY_BUTTON_LABEL}
        </button>
      </div>
    </div>
  );
}
