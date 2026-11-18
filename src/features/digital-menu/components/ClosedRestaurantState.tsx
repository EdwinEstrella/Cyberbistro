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
        <div className="w-full rounded-[20px] border border-[#262626] bg-[#131313] p-7 shadow-2xl">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={title ? `Logo de ${title}` : "Logo"}
              className="mx-auto size-20 rounded-full object-contain bg-[#1a1a1a] border border-[#262626] p-2 mb-4"
            />
          ) : (
            <div className="mx-auto size-16 rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] grid place-items-center mb-4">
              <span className="text-3xl" role="img" aria-label="Restaurante cerrado">
                🕒
              </span>
            </div>
          )}
          {title && <h1 className={`text-xl font-bold text-[#fafafa] mb-2 ${publicMenuTheme.headingFontClass}`}>{title}</h1>}
          <p className="text-xs text-[#adaaaa] leading-relaxed mb-6">
            {RESTAURANT_CLOSED_MESSAGE}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full rounded-full bg-[#ff906d] px-5 py-3 text-sm font-bold text-[#5b1600] hover:bg-[#ffb59c] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-98"
          >
            {isRetrying ? "Verificando..." : RETRY_BUTTON_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
