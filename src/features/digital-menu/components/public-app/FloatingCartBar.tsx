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
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 bottom-[calc(92px+env(safe-area-inset-bottom,0px))] z-20 pointer-events-none lg:hidden"
    >
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={`Ver pedido, ${itemCount} ${itemCount === 1 ? "artículo" : "artículos"}, total ${currencyFormatter(total, currency)}`}
        className="pointer-events-auto flex w-full items-center justify-between h-[56px] rounded-[18px] bg-[#ff906d] px-4 shadow-[0_12px_30px_rgba(0,0,0,0.5)] transition active:scale-98 cursor-pointer hover:bg-[#ffb59c]"
      >
        <div className="flex items-center gap-3">
          <span 
            data-testid="floating-cart-count"
            className="flex size-[26px] items-center justify-center rounded-[8px] bg-[#5b1600] text-[#ff906d] text-[13px] font-bold tabular-nums"
          >
            {itemCount}
          </span>
          <span className="text-[15px] font-extrabold text-[#5b1600]">Ver pedido</span>
        </div>
        <span className="font-extrabold text-[15px] text-[#5b1600] tabular-nums">
          {currencyFormatter(total, currency)}
        </span>
      </button>
    </div>
  );
}
