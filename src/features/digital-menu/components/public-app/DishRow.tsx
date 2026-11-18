import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { DishImage } from "../DishImage";
import { getCategoryIcon } from "../../lib/categoryIcons";

export interface DishRowProps {
  item: PublicMenuItem;
  quantityInCart: number;
  onAdd: () => void;
  onUpdateQuantity: (quantity: number) => void;
  currency: string;
  currencyFormatter: (value: number, currency: string) => string;
  onSelect?: (item: PublicMenuItem) => void;
}

export function DishRow({
  item,
  quantityInCart,
  onAdd,
  onUpdateQuantity,
  currency,
  currencyFormatter,
  onSelect,
}: DishRowProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAdd = () => {
    onAdd();
    setFeedback("Agregado");
    setTimeout(() => setFeedback(null), 1500);
  };

  const handleDecrement = () => {
    const next = quantityInCart - 1;
    onUpdateQuantity(next);
  };

  const handleIncrement = () => {
    if (quantityInCart < 99) {
      onUpdateQuantity(quantityInCart + 1);
    }
  };

  const CategoryIcon = getCategoryIcon(item.category);

  return (
    <article
      data-testid={`dish-row-${item.plato_id}`}
      className="group relative flex items-center gap-3 rounded-[18px] border border-[#262626] bg-[#131313] p-2.5"
    >
      {/* Row trigger button: Thumbnail LEFT + Info MIDDLE */}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onSelect?.(item)}
        className="flex flex-1 items-center gap-3 text-left transition cursor-pointer"
      >
        {/* 76px rounded-[14px] thumbnail on the LEFT */}
        <div className="relative size-[76px] shrink-0">
          {item.image_url ? (
            <DishImage
              src={item.image_url}
              alt={item.name}
              className="size-[76px] rounded-[14px] object-cover bg-[#1a1a1a] border border-[#262626]"
              fallbackClassName="size-[76px] rounded-[14px] flex items-center justify-center bg-[#1a1a1a] border border-[#262626] text-[#adaaaa]"
            />
          ) : (
            <div
              role="img"
              aria-label={`Sin imagen para ${item.name}`}
              className="size-[76px] rounded-[14px] flex items-center justify-center bg-[#1a1a1a] border border-[#262626] text-[#adaaaa]"
            >
              <CategoryIcon className="size-7 text-[#5c5c5c]" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Info: Name, Description, Price */}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-[#fafafa] leading-snug line-clamp-1">
            {item.name}
          </h3>
          {item.description && (
            <p className="mt-0.5 text-[12px] text-[#adaaaa] line-clamp-1 leading-relaxed">
              {item.description}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#ff906d] tabular-nums">
              {currencyFormatter(item.price, currency)}
            </span>
            {feedback && (
              <span
                role="status"
                className="text-[10px] font-semibold text-[#ffb59c] bg-[#2b160d] border border-[#5b2a17] px-2 py-0.5 rounded-full animate-fade-in"
              >
                {feedback}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Quick "+" button or inline stepper on the RIGHT, vertically centered */}
      <div className="shrink-0">
        {quantityInCart === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Agregar ${item.name}`}
            className="flex size-9 items-center justify-center rounded-full bg-[#fafafa] text-[#0e0e0e] shadow-md active:scale-95 transition cursor-pointer"
          >
            <Plus className="size-5" strokeWidth={2.6} aria-hidden="true" />
          </button>
        ) : (
          <div
            role="group"
            aria-label={`Cantidad de ${item.name}`}
            className="flex items-center gap-1 rounded-full bg-[#1a1a1a] border border-[#262626] p-0.5"
          >
            <button
              type="button"
              onClick={handleDecrement}
              aria-label={`Disminuir cantidad de ${item.name}`}
              className="flex size-8 items-center justify-center rounded-full text-[#fafafa] hover:bg-[#262626] active:scale-90 transition cursor-pointer"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span
              data-testid={`stepper-count-${item.plato_id}`}
              className="min-w-[16px] px-0.5 text-center text-[14px] font-bold text-[#fafafa] tabular-nums"
            >
              {quantityInCart}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={quantityInCart >= 99}
              aria-label={`Aumentar cantidad de ${item.name}`}
              className="flex size-8 items-center justify-center rounded-full bg-[#fafafa] text-[#0e0e0e] font-bold hover:bg-[#d4d4d4] active:scale-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
