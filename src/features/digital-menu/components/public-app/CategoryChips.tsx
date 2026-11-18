import { Search, X } from "lucide-react";

export interface CategoryChipsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function CategoryChips({
  categories,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
}: CategoryChipsProps) {
  return (
    <div className="sticky top-[108px] z-10 w-full bg-[#0e0e0e]/95 backdrop-blur-md px-4 pt-[20px] pb-[4px] space-y-[12px]">
      {/* Slim search input: rounded-2xl, height 46px */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="¿Qué se te antoja hoy?"
          aria-label="Buscar platos, categorías o ingredientes en el menú"
          className="w-full h-[46px] rounded-[14px] border border-[#262626] bg-[#131313] pl-10 pr-9 py-2 text-[14px] text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 transition"
        />
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-[#adaaaa] pointer-events-none" aria-hidden="true" />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#adaaaa] hover:text-[#fafafa] transition cursor-pointer"
          >
            <X className="size-[18px]" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Horizontal category chips: active white bg, inactive #131313 */}
      <nav
        aria-label="Categorías del menú"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-0.5"
      >
        <button
          type="button"
          onClick={() => onSelectCategory("all")}
          aria-pressed={selectedCategory === "all"}
          className={`h-[36px] snap-start shrink-0 rounded-full px-[14px] text-[13px] font-bold transition cursor-pointer active:scale-95 whitespace-nowrap flex items-center justify-center ${
            selectedCategory === "all"
              ? "bg-[#fafafa] text-[#0e0e0e]"
              : "bg-[#131313] border border-[#262626] text-[#d6d4d4] hover:text-[#fafafa] hover:bg-[#262626]"
          }`}
        >
          Todo
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              aria-pressed={isSelected}
              className={`h-[36px] snap-start shrink-0 rounded-full px-[14px] text-[13px] font-bold transition cursor-pointer active:scale-95 whitespace-nowrap flex items-center justify-center ${
                isSelected
                  ? "bg-[#fafafa] text-[#0e0e0e]"
                  : "bg-[#131313] border border-[#262626] text-[#d6d4d4] hover:text-[#fafafa] hover:bg-[#262626]"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
