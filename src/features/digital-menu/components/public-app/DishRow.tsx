import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { DishImage } from "../DishImage";
import { getCategoryIcon } from "../../lib/categoryIcons";
import { publicMenuTheme } from "./publicMenuTheme";

export interface DishRowProps {
  item: PublicMenuItem;
  quantityInCart: number;
  onAdd: () => void;
  onUpdateQuantity: (quantity: number) => void;
  currency: string;
  currencyFormatter: (value: number, currency: string) => string;
}

export function DishRow({
  item,
  quantityInCart,
  onAdd,
  onUpdateQuantity,
  currency,
  currencyFormatter,
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
      className="group relative flex items-center justify-between gap-3 rounded-[20px] border border-[#262626] bg-[#131313] p-3.5 transition hover:border-[#3a3a3a]"
    >
      {/* Info: Name, Description, Price on the LEFT */}
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className={`text-sm font-bold text-[#fafafa] leading-snug line-clamp-2 break-words ${publicMenuTheme.headingFontClass}`}>
          {item.name}
        </h3>
        {item.description && (
          <p className="mt-1 text-xs text-[#adaaaa] line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs font-bold text-[#ff906d] tabular-nums">
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

      {/* 84px rounded-[16px] thumbnail on the RIGHT with round button over the corner */}
      <div className="relative size-[84px] shrink-0">
        {item.image_url ? (
          <DishImage
            src={item.image_url}
            alt={item.name}
            className="size-[84px] rounded-[16px] object-cover bg-[#1a1a1a] border border-[#262626]"
            fallbackClassName="size-[84px] rounded-[16px] flex items-center justify-center bg-[#1a1a1a] border border-[#262626] text-[#adaaaa]"
          />
        ) : (
          <div
            role="img"
            aria-label={`Sin imagen para ${item.name}`}
            className="size-[84px] rounded-[16px] flex items-center justify-center bg-[#1a1a1a] border border-[#262626] text-[#adaaaa]"
          >
            <CategoryIcon className="size-6 text-[#ff906d] opacity-80" aria-hidden="true" />
          </div>
        )}

        {/* Round "+" button or inline stepper over thumbnail corner */}
        {quantityInCart === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Agregar ${item.name}`}
            className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full bg-[#ff906d] text-[#5b1600] font-bold shadow-md hover:bg-[#ffb59c] active:scale-95 transition cursor-pointer z-10"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <div
            role="group"
            aria-label={`Cantidad de ${item.name}`}
            className="absolute -bottom-1 -right-1 flex items-center gap-0.5 rounded-full bg-[#1a1a1a] border border-[#262626] p-0.5 shadow-lg z-10"
          >
            <button
              type="button"
              onClick={handleDecrement}
              aria-label={`Disminuir cantidad de ${item.name}`}
              className="flex size-8 items-center justify-center rounded-full bg-[#262626] text-[#fafafa] hover:bg-[#3a3a3a] active:scale-90 transition cursor-pointer"
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <span
              data-testid={`stepper-count-${item.plato_id}`}
              className="min-w-[16px] px-1 text-center text-xs font-bold text-[#fafafa] tabular-nums"
            >
              {quantityInCart}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={quantityInCart >= 99}
              aria-label={`Aumentar cantidad de ${item.name}`}
              className="flex size-8 items-center justify-center rounded-full bg-[#ff906d] text-[#5b1600] font-bold hover:bg-[#ffb59c] active:scale-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
