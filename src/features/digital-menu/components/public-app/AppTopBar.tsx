import { ShoppingBag } from "lucide-react";
import type { PublicMenuMode } from "../../lib/publicMenuMode";
import type { DeliveryDraft } from "../../lib/deliveryOrder";
import { publicMenuTheme } from "./publicMenuTheme";

export interface AppTopBarProps {
  title: string;
  logoUrl?: string | null;
  mode: PublicMenuMode;
  partySize: number | null;
  cartCount: number;
  onOpenCart: () => void;
  onChangePartySize: () => void;
  isOpen?: boolean | null;
  delivery?: DeliveryDraft;
  onDeliveryChange?: (next: DeliveryDraft) => void;
}

export function AppTopBar({
  title,
  logoUrl,
  mode,
  partySize,
  cartCount,
  onOpenCart,
  onChangePartySize,
  isOpen = true,
  delivery,
  onDeliveryChange,
}: AppTopBarProps) {
  const isTableMode = mode.kind === "table";
  const initial = title?.trim().charAt(0).toUpperCase() || "R";
  const isRestaurantOpen = isOpen !== false;

  return (
    <header className="sticky top-0 z-20 w-full bg-[#0e0e0e]/95 backdrop-blur-md border-b border-[#262626] px-4 py-3 flex flex-col gap-2.5">
      {/* Row 1: Logo + Restaurant Name & Open status + Cart trigger */}
      <div className="flex items-center justify-between gap-3">
        {/* Left side: Logo or initial avatar */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title}
            className="size-11 rounded-full object-cover bg-[#1a1a1a] border border-[#262626] p-0.5 shrink-0"
          />
        ) : (
          <div
            aria-hidden="true"
            className={`size-11 rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] flex items-center justify-center font-bold text-base shrink-0 ${publicMenuTheme.headingFontClass}`}
          >
            {initial}
          </div>
        )}

        {/* Center: Restaurant name (Space Grotesk 22px/800) + status */}
        <div className="min-w-0 flex-1 flex flex-col items-start justify-center">
          <h1 className={`text-[22px] font-extrabold text-[#fafafa] truncate w-full leading-tight tracking-tight ${publicMenuTheme.headingFontClass}`}>
            {title}
          </h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold">
            {isRestaurantOpen ? (
              <span className="inline-flex items-center gap-1.5 text-[#59ee50]">
                <span className="size-2 rounded-full bg-[#59ee50] animate-pulse" aria-hidden="true" />
                <span>Abierto ahora</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#adaaaa]">
                <span className="size-2 rounded-full bg-[#3a3a3a]" aria-hidden="true" />
                <span>Cerrado</span>
              </span>
            )}
          </div>
        </div>

        {/* Right side: Cart trigger button */}
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={
            cartCount > 0
              ? `Ver pedido (${cartCount} ${cartCount === 1 ? "item" : "items"})`
              : "Ver pedido"
          }
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] border border-[#262626] text-[#fafafa] hover:bg-[#262626] transition cursor-pointer active:scale-95 lg:hidden"
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
          {cartCount > 0 && (
            <span
              data-testid="topbar-cart-badge"
              className="absolute -top-1 -right-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[#ff906d] px-1 text-[10px] font-black text-[#5b1600] shadow-sm tabular-nums"
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Row 2: Mode context (Table chip vs Takeout/Delivery toggle) */}
      <div className="flex items-center">
        {isTableMode ? (
          <button
            type="button"
            onClick={onChangePartySize}
            title="Cambiar cantidad de personas o mesa"
            aria-label={`Mesa ${mode.mesa}${
              partySize ? `, ${partySize} ${partySize === 1 ? "persona" : "personas"}` : ""
            }. Tocá para cambiar.`}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#ffb59c] hover:text-[#ff906d] transition cursor-pointer active:scale-95 whitespace-nowrap"
          >
            <span className="rounded-full border border-[#5b2a17] bg-[#2b160d] px-3 py-1 leading-tight font-semibold">
              🪑 Mesa {mode.mesa}
              {partySize ? ` · ${partySize} ${partySize === 1 ? "persona" : "personas"}` : ""}
            </span>
          </button>
        ) : onDeliveryChange ? (
          <div
            role="radiogroup"
            aria-label="Modalidad de pedido"
            className="inline-flex items-center p-0.5 rounded-full bg-[#1a1a1a] border border-[#262626]"
          >
            <button
              type="button"
              role="radio"
              aria-checked={delivery?.mode !== "delivery"}
              onClick={() =>
                onDeliveryChange({
                  ...(delivery ?? { mode: "pickup", lat: null, lng: null, reference: "" }),
                  mode: "pickup",
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer active:scale-95 ${
                delivery?.mode !== "delivery"
                  ? "bg-[#ff906d] text-[#5b1600] shadow-sm"
                  : "text-[#adaaaa] hover:text-[#fafafa]"
              }`}
            >
              Para llevar
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={delivery?.mode === "delivery"}
              onClick={() =>
                onDeliveryChange({
                  ...(delivery ?? { mode: "pickup", lat: null, lng: null, reference: "" }),
                  mode: "delivery",
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer active:scale-95 ${
                delivery?.mode === "delivery"
                  ? "bg-[#ff906d] text-[#5b1600] shadow-sm"
                  : "text-[#adaaaa] hover:text-[#fafafa]"
              }`}
            >
              Delivery
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#262626] bg-[#1a1a1a] px-3 py-1 text-xs font-medium text-[#adaaaa] whitespace-nowrap leading-tight">
            🛍 Para llevar
          </span>
        )}
      </div>
    </header>
  );
}
