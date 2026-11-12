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
    <div className="sticky top-[57px] z-10 w-full bg-[#0b0b0d]/95 backdrop-blur-md border-b border-[#27272a] px-4 py-2.5 space-y-2">
      {/* Slim search input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar en el menú"
          aria-label="Buscar platos, categorías o ingredientes en el menú"
          className="w-full rounded-xl border border-[#27272a] bg-[#18181b] pl-9 pr-8 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50 transition"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Horizontal category chips */}
      <nav
        aria-label="Categorías del menú"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-0.5"
      >
        <button
          type="button"
          onClick={() => onSelectCategory("all")}
          aria-pressed={selectedCategory === "all"}
          className={`snap-start shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap ${
            selectedCategory === "all"
              ? "bg-white text-zinc-950 shadow-sm"
              : "bg-[#18181b] border border-[#27272a] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
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
              className={`snap-start shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap ${
                isSelected
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "bg-[#18181b] border border-[#27272a] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
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
