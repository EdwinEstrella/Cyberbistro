import { ShoppingBag, Armchair } from "lucide-react";
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
  isOpen = true,
  delivery,
  onDeliveryChange,
}: AppTopBarProps) {
  const isTableMode = mode.kind === "table";
  const initial = title?.trim().charAt(0).toUpperCase() || "R";
  const isRestaurantOpen = isOpen !== false;

  return (
    <header className="sticky top-0 z-20 w-full bg-[#0e0e0e]/95 backdrop-blur-md border-b border-[#262626] pt-[20px] px-4 pb-[12px] flex flex-col gap-3">
      {/* Row 1: Logo + Restaurant Name & Open status + Cart trigger */}
      <div className="flex items-center justify-between gap-3">
        {/* Left side: Logo or initial avatar */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title}
            className="size-11 rounded-[14px] object-contain bg-[#1a1a1a] border border-[#262626] shrink-0"
          />
        ) : (
          <div
            aria-hidden="true"
            className={`size-11 rounded-[14px] bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] flex items-center justify-center font-extrabold text-[18px] shrink-0 ${publicMenuTheme.headingFontClass}`}
          >
            {initial}
          </div>
        )}

        {/* Center: Restaurant name (16px/700) + status */}
        <div className="min-w-0 flex-1 flex flex-col items-start justify-center gap-0.5">
          <h1 className="text-[16px] font-bold text-[#fafafa] truncate w-full tracking-[-0.01em]">
            {title}
          </h1>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#adaaaa]">
            <span className={`size-[7px] rounded-full ${isRestaurantOpen ? "bg-[#59ee50]" : "bg-[#3a3a3a]"}`} aria-hidden="true" />
            <span>{isRestaurantOpen ? "Abierto ahora" : "Cerrado"}</span>
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
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] border border-[#262626] text-[#fafafa] hover:bg-[#262626] transition cursor-pointer active:scale-95 lg:hidden"
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
      <div className="flex items-center px-0">
        {isTableMode ? (
          <span
            title="Mesa actual"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#5b2a17] bg-[#2b160d] px-3 py-1 text-xs font-semibold text-[#ffb59c] leading-tight whitespace-nowrap"
          >
            <Armchair className="size-3.5" />
            Mesa {mode.mesa}
            {partySize ? ` · ${partySize} ${partySize === 1 ? "persona" : "personas"}` : ""}
          </span>
        ) : onDeliveryChange ? (
          <div
            role="radiogroup"
            aria-label="Modalidad de pedido"
            className="grid w-full grid-cols-2 gap-1 rounded-full bg-[#131313] border border-[#262626] p-1"
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
              className={`h-[36px] rounded-full text-[13px] font-bold transition cursor-pointer active:scale-95 ${
                delivery?.mode !== "delivery"
                  ? "bg-[#fafafa] text-[#0e0e0e]"
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
              className={`h-[36px] rounded-full text-[13px] font-bold transition cursor-pointer active:scale-95 ${
                delivery?.mode === "delivery"
                  ? "bg-[#fafafa] text-[#0e0e0e]"
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
