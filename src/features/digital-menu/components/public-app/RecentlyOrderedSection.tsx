import { DishImage } from "../DishImage";
import { getCategoryIcon } from "../../lib/categoryIcons";
import { formatOrderedWhen, type RecentDishEntry } from "../../lib/recentDishes";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { publicMenuTheme } from "./publicMenuTheme";

export interface RecentlyOrderedSectionProps {
  entries: RecentDishEntry[];
  now: Date;
  currency: string;
  currencyFormatter: (value: number, currency: string) => string;
  onRepeat: (item: PublicMenuItem) => void;
  onSelect: (item: PublicMenuItem) => void;
}

/** Horizontal "Lo pediste recientemente" cards from the dishes this device ordered before. */
export function RecentlyOrderedSection({
  entries,
  now,
  currency,
  currencyFormatter,
  onRepeat,
  onSelect,
}: RecentlyOrderedSectionProps) {
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="recently-ordered-title" className="pt-[22px]">
      <h2
        id="recently-ordered-title"
        className={`px-4 pb-3 text-[18px] font-extrabold tracking-[-0.02em] text-[#fafafa] ${publicMenuTheme.headingFontClass}`}
      >
        Lo pediste recientemente
      </h2>
      <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map(({ item, orderedAt }) => {
          const CategoryIcon = getCategoryIcon(item.category);
          return (
            <li
              key={item.plato_id}
              data-testid={`recent-dish-${item.plato_id}`}
              className="flex w-[168px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-[#262626] bg-[#131313]"
            >
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => onSelect(item)}
                className="block text-left cursor-pointer focus:outline-hidden focus-visible:ring-1 focus-visible:ring-[#ff906d]"
              >
                <div className="relative flex h-[92px] items-center justify-center bg-[#1a1a1a]">
                  {item.image_url ? (
                    <DishImage
                      src={item.image_url}
                      alt={item.name}
                      className="h-[92px] w-full object-contain"
                      fallbackClassName="flex h-[92px] w-full items-center justify-center text-[#5c5c5c]"
                    />
                  ) : (
                    <CategoryIcon className="size-[34px] text-[#5c5c5c]" aria-hidden="true" />
                  )}
                  <span className="absolute left-2 top-2 rounded-full border border-[#5b2a17] bg-[#2b160d] px-[7px] py-[3px] text-[10px] font-bold text-[#ffb59c]">
                    {formatOrderedWhen(new Date(orderedAt), now)}
                  </span>
                </div>
                <p className="truncate px-3 pt-2.5 text-[14px] font-bold text-[#fafafa]">{item.name}</p>
              </button>
              <div className="flex items-center justify-between px-3 pb-3 pt-2">
                <span className="text-[13px] font-bold text-[#ff906d] tabular-nums">
                  {currencyFormatter(item.price, currency)}
                </span>
                <button
                  type="button"
                  onClick={() => onRepeat(item)}
                  aria-label={`Repetir ${item.name}`}
                  className="h-[30px] rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-2.5 text-[12px] font-semibold text-[#fafafa] transition hover:bg-[#262626] active:scale-95 cursor-pointer"
                >
                  Repetir
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
