import { ShoppingBag } from "lucide-react";

export interface FloatingCartBarProps {
  itemCount: number;
  total: number;
  currency: string;
  currencyFormatter: (value: number, currency: string) => string;
  onOpenCart: () => void;
  visible?: boolean;
}

export function FloatingCartBar({
  itemCount,
  total,
  currency,
  currencyFormatter,
  onOpenCart,
  visible = true,
}: FloatingCartBarProps) {
  if (!visible || itemCount <= 0) return null;

  return (
    <div
      data-testid="floating-cart-bar"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 z-20 pointer-events-none lg:hidden"
    >
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={`Ver pedido, ${itemCount} ${itemCount === 1 ? "artículo" : "artículos"}, total ${currencyFormatter(total, currency)}`}
        className="pointer-events-auto flex w-full items-center justify-between rounded-full bg-[#ff906d] px-5 py-3.5 text-xs font-bold text-[#5b1600] shadow-xl transition active:scale-98 cursor-pointer hover:bg-[#ffb59c]"
      >
        <div className="flex items-center gap-2 whitespace-nowrap">
          <ShoppingBag className="size-4 shrink-0 text-[#5b1600]" aria-hidden="true" />
          <span>Ver pedido</span>
          <span aria-hidden="true">·</span>
          <span>{itemCount}</span>
        </div>
        <span className="font-extrabold text-sm text-[#5b1600] tabular-nums">
          {currencyFormatter(total, currency)}
        </span>
      </button>
    </div>
  );
}
