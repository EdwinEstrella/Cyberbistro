import { useState } from "react";
import { Plus, Minus, UtensilsCrossed } from "lucide-react";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { DishImage } from "../DishImage";

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

  return (
    <article
      data-testid={`dish-row-${item.plato_id}`}
      className="group relative flex items-center justify-between gap-3 rounded-2xl border border-[#27272a] bg-[#111113] p-3 transition hover:bg-[#141416] hover:border-zinc-700"
    >
      {/* Thumbnail */}
      <div className="shrink-0">
        {item.image_url ? (
          <DishImage
            src={item.image_url}
            alt={item.name}
            className="size-[76px] rounded-xl object-cover bg-zinc-900 border border-[#27272a]/50"
            fallbackClassName="size-[76px] rounded-xl flex items-center justify-center bg-[#18181b] border border-[#27272a] text-zinc-500"
          />
        ) : (
          <div
            role="img"
            aria-label={`Sin imagen para ${item.name}`}
            className="size-[76px] rounded-xl flex items-center justify-center bg-[#18181b] border border-[#27272a] text-zinc-500"
          >
            <UtensilsCrossed className="size-5 opacity-40 text-emerald-400" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Info: Name, Description, Price */}
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 break-words">
          {item.name}
        </h3>
        {item.description && (
          <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs font-bold text-emerald-400 tabular-nums">
            {currencyFormatter(item.price, currency)}
          </span>
        </div>
      </div>

      {/* Action / Stepper */}
      <div className="w-[96px] shrink-0 flex items-center justify-end">
        {quantityInCart === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Agregar ${item.name}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 font-bold shadow-sm hover:bg-zinc-200 active:scale-95 transition cursor-pointer"
          >
            <Plus className="size-4" />
          </button>
        ) : (
          <div
            role="group"
            aria-label={`Cantidad de ${item.name}`}
            className="flex items-center gap-1 rounded-full bg-[#18181b] border border-[#27272a] p-0.5 shrink-0"
          >
            <button
              type="button"
              onClick={handleDecrement}
              aria-label={`Disminuir cantidad de ${item.name}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 hover:text-white hover:bg-zinc-800 active:scale-90 transition cursor-pointer"
            >
              <Minus className="size-3.5" />
            </button>
            <span
              data-testid={`stepper-count-${item.plato_id}`}
              className="min-w-[18px] text-center text-xs font-black text-white tabular-nums"
            >
              {quantityInCart}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={quantityInCart >= 99}
              aria-label={`Aumentar cantidad de ${item.name}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 hover:text-white hover:bg-zinc-800 active:scale-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Live region for accessibility feedback */}
      <span className="sr-only" aria-live="polite">
        {feedback}
      </span>
    </article>
  );
}
