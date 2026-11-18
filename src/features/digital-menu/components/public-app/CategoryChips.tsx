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
    <div className="sticky top-[57px] z-10 w-full bg-[#0e0e0e]/95 backdrop-blur-md border-b border-[#262626] px-4 py-2.5 space-y-2">
      {/* Slim search input: rounded-full, #1a1a1a */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar en el menú"
          aria-label="Buscar platos, categorías o ingredientes en el menú"
          className="w-full rounded-full border border-[#262626] bg-[#1a1a1a] pl-9 pr-8 py-2 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 transition"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#adaaaa] pointer-events-none" aria-hidden="true" />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#adaaaa] hover:text-[#fafafa] transition cursor-pointer"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Horizontal category chips: active coral bg + #5b1600 text, rounded-full */}
      <nav
        aria-label="Categorías del menú"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-0.5"
      >
        <button
          type="button"
          onClick={() => onSelectCategory("all")}
          aria-pressed={selectedCategory === "all"}
          className={`snap-start shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap ${
            selectedCategory === "all"
              ? "bg-[#ff906d] text-[#5b1600] font-bold shadow-sm"
              : "bg-[#1a1a1a] border border-[#262626] text-[#adaaaa] hover:text-[#fafafa] hover:bg-[#262626]"
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
              className={`snap-start shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap ${
                isSelected
                  ? "bg-[#ff906d] text-[#5b1600] font-bold shadow-sm"
                  : "bg-[#1a1a1a] border border-[#262626] text-[#adaaaa] hover:text-[#fafafa] hover:bg-[#262626]"
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
