import { ShoppingBag } from "lucide-react";
import type { PublicMenuMode } from "../../lib/publicMenuMode";

export interface AppTopBarProps {
  title: string;
  logoUrl?: string | null;
  mode: PublicMenuMode;
  partySize: number | null;
  cartCount: number;
  onOpenCart: () => void;
  onChangePartySize: () => void;
}

export function AppTopBar({
  title,
  logoUrl,
  mode,
  partySize,
  cartCount,
  onOpenCart,
  onChangePartySize,
}: AppTopBarProps) {
  const isTableMode = mode.kind === "table";
  const initial = title?.trim().charAt(0).toUpperCase() || "R";

  return (
    <header className="sticky top-0 z-20 w-full bg-[#0b0b0d]/95 backdrop-blur-md border-b border-[#27272a] px-4 py-2.5 flex items-center justify-between gap-3">
      {/* Left side: Logo */}
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={title}
          className="size-10 rounded-xl object-contain bg-[#18181b] border border-[#27272a] p-1 shrink-0"
        />
      ) : (
        <div
          aria-hidden="true"
          className="size-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0"
        >
          {initial}
        </div>
      )}

      {/* Left block (stacked two lines): Restaurant name + Context chip */}
      <div className="min-w-0 flex-1 flex flex-col items-start justify-center">
        <h1 className="text-sm font-bold text-white truncate w-full leading-tight">
          {title}
        </h1>
        <div className="mt-0.5 flex items-center">
          {isTableMode ? (
            <button
              type="button"
              onClick={onChangePartySize}
              title="Cambiar cantidad de personas o mesa"
              aria-label={`Mesa ${mode.mesa}${
                partySize ? `, ${partySize} ${partySize === 1 ? "persona" : "personas"}` : ""
              }. Tocá para cambiar.`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 leading-tight">
                🪑 Mesa {mode.mesa}
                {partySize ? ` · ${partySize} ${partySize === 1 ? "persona" : "personas"}` : ""}
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#27272a] bg-[#18181b] px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 whitespace-nowrap leading-tight">
              🛍 Para llevar
            </span>
          )}
        </div>
      </div>

      {/* Right side: Cart trigger */}
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={
          cartCount > 0
            ? `Ver pedido (${cartCount} ${cartCount === 1 ? "item" : "items"})`
            : "Ver pedido"
        }
        className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#18181b] border border-[#27272a] text-zinc-200 hover:text-white hover:bg-zinc-800 transition cursor-pointer active:scale-95"
      >
        <ShoppingBag className="size-5" />
        {cartCount > 0 && (
          <span
            data-testid="topbar-cart-badge"
            className="absolute -top-1 -right-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-black text-zinc-950 shadow-sm tabular-nums"
          >
            {cartCount}
          </span>
        )}
      </button>
    </header>
  );
}
