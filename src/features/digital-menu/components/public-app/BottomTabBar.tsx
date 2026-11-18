import { House, ShoppingBag, Clock } from "lucide-react";

export interface BottomTabBarProps {
  activeTab: "menu" | "services";
  onTabChange: (tab: "menu" | "services") => void;
  onOpenCart: () => void;
  cartCount: number;
}

export function BottomTabBar({
  activeTab,
  onTabChange,
  onOpenCart,
  cartCount,
}: BottomTabBarProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 inset-x-0 z-30 min-h-[78px] bg-[#0a0a0a] border-t border-[#1c1c1c] pb-[calc(14px+env(safe-area-inset-bottom,0px))] flex items-center justify-center lg:sticky lg:border-t-0"
    >
      <div role="tablist" className="grid grid-cols-3 w-full max-w-[480px]">
        {/* Tab 1: Inicio */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "menu"}
          aria-current={activeTab === "menu" ? "page" : undefined}
          onClick={() => onTabChange("menu")}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer active:scale-95 ${
            activeTab === "menu" ? "text-[#fafafa] font-bold" : "text-[#adaaaa] font-semibold"
          }`}
        >
          <House className="size-[22px]" strokeWidth={2} aria-hidden="true" />
          <span>Inicio</span>
        </button>

        {/* Tab 2: Pedido */}
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
          className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#adaaaa] transition cursor-pointer active:scale-95"
        >
          <ShoppingBag className="size-[22px]" strokeWidth={2} aria-hidden="true" />
          <span>Pedido</span>
          {cartCount > 0 && (
            <span
              data-testid="bottom-tab-badge"
              className="absolute top-2 right-1/2 mr-1 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-[#ff906d] px-1 text-[10px] font-black text-[#5b1600] shadow-sm"
            >
              {cartCount}
            </span>
          )}
        </button>

        {/* Tab 3: Servicios */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "services"}
          aria-current={activeTab === "services" ? "page" : undefined}
          onClick={() => onTabChange("services")}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer active:scale-95 ${
            activeTab === "services" ? "text-[#fafafa] font-bold" : "text-[#adaaaa] font-semibold"
          }`}
        >
          <Clock className="size-[22px]" strokeWidth={2} aria-hidden="true" />
          <span>Servicios</span>
        </button>
      </div>
    </nav>
  );
}

