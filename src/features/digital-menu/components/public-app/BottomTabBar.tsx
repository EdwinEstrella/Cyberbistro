import { UtensilsCrossed, Sparkles, ShoppingBag } from "lucide-react";

export interface BottomTabBarProps {
  activeTab: "menu" | "services";
  onTabChange: (tab: "menu" | "services") => void;
  onOpenCart: () => void;
  cartCount: number;
  isTableMode: boolean;
}

export function BottomTabBar({
  activeTab,
  onTabChange,
  onOpenCart,
  cartCount,
  isTableMode,
}: BottomTabBarProps) {
  const servicesLabel = isTableMode ? "Servicios" : "Info";

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-30 bg-[#0b0b0d]/95 backdrop-blur-md border-t border-[#27272a] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] lg:sticky lg:left-auto lg:translate-x-0 lg:max-w-none"
    >
      <div role="tablist" className="grid grid-cols-3 gap-1 lg:grid-cols-2 lg:mx-auto lg:max-w-md">
        {/* Tab 1: Menú */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "menu"}
          aria-current={activeTab === "menu" ? "page" : undefined}
          onClick={() => onTabChange("menu")}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition cursor-pointer active:scale-95 ${
            activeTab === "menu"
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
          }`}
        >
          <UtensilsCrossed className="size-5" />
          <span>Menú</span>
        </button>

        {/* Tab 2: Servicios / Info */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "services"}
          aria-current={activeTab === "services" ? "page" : undefined}
          onClick={() => onTabChange("services")}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition cursor-pointer active:scale-95 ${
            activeTab === "services"
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
          }`}
        >
          <Sparkles className="size-5" />
          <span>{servicesLabel}</span>
        </button>

        {/* Tab 3: Pedido (Drawer trigger) */}
        <button
          type="button"
          role="tab"
          aria-selected={false}
          onClick={onOpenCart}
          aria-label={
            cartCount > 0
              ? `Pedido (${cartCount} ${cartCount === 1 ? "item" : "items"})`
              : "Pedido"
          }
          className="relative flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition cursor-pointer active:scale-95 lg:hidden"
        >
          <div className="relative">
            <ShoppingBag className="size-5" />
            {cartCount > 0 && (
              <span
                data-testid="bottom-tab-badge"
                className="absolute -top-1.5 -right-2.5 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-black text-zinc-950 shadow-sm"
              >
                {cartCount}
              </span>
            )}
          </div>
          <span>Pedido</span>
        </button>
      </div>
    </nav>
  );
}
