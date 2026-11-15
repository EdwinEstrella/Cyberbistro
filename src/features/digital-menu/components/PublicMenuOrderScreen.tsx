import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import type { PublicMenuMode } from "../lib/publicMenuMode";
import type { PublicContact } from "../../menu-links/lib/publicMenuCalendar";
import type { DeliveryDraft } from "../lib/deliveryOrder";
import { AppTopBar } from "./public-app/AppTopBar";
import { CategoryChips } from "./public-app/CategoryChips";
import { DishRow } from "./public-app/DishRow";
import { BottomTabBar } from "./public-app/BottomTabBar";
import { CartDrawer } from "./public-app/CartDrawer";
import { ServicesTab } from "./public-app/ServicesTab";
import { publicMenuTheme } from "./public-app/publicMenuTheme";

export interface PublicMenuSettings {
  tenant_id: string;
  public_slug: string;
  title: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  business_name: string;
  phone: string | null;
  address: string | null;
  currency: string;
}

export interface PublicMenuItem {
  id: string;
  plato_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category: string;
  sort_order: number;
}

export type CartLine = PublicMenuItem & { quantity: number; notes?: string };

export interface PublicMenuOrderScreenProps {
  settings: PublicMenuSettings;
  mode: PublicMenuMode;
  partySize: number | null;
  items: PublicMenuItem[];
  cart: CartLine[];
  onAddItem: (item: PublicMenuItem) => void;
  onUpdateQuantity: (platoId: number, quantity: number) => void;
  onClearCart?: () => void;
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  mesaCodigo: string;
  onMesaCodigoChange: (val: string) => void;
  mesaCodeError: string | null;
  /** Home delivery choice for takeout orders (optional: omitted means pickup only). */
  delivery?: DeliveryDraft;
  onDeliveryChange?: (next: DeliveryDraft) => void;
  error: string | null;
  success: { message: string; numeroPedido: number | null } | null;
  placing: boolean;
  onPlaceOrder: () => void;
  onBackToHome: () => void;
  onDismissSuccess?: () => void;
  contact?: PublicContact | null;
  currencyFormatter: (value: number, code: string) => string;
  slug?: string;
  tenantId?: string | null;
}

export function PublicMenuOrderScreen({
  settings,
  mode,
  partySize,
  items,
  cart,
  onAddItem,
  onUpdateQuantity,
  onClearCart,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  notes,
  onNotesChange,
  mesaCodigo,
  onMesaCodigoChange,
  mesaCodeError,
  delivery,
  onDeliveryChange,
  error,
  success,
  placing,
  onPlaceOrder,
  onBackToHome,
  onDismissSuccess,
  contact,
  currencyFormatter,
  slug,
  tenantId,
}: PublicMenuOrderScreenProps) {
  const [activeTab, setActiveTab] = useState<"menu" | "services">("menu");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Derive unique categories from items
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category?.trim()) {
        set.add(item.category.trim());
      }
    }
    return Array.from(set);
  }, [items]);

  // Filter items based on search and selected category
  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedCategory !== "all") {
      result = result.filter((item) => (item.category || "General") === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [items, selectedCategory, searchQuery]);

  // Group items by category for clean section headers when "all" is selected
  const groupedItems = useMemo(() => {
    if (selectedCategory !== "all") {
      return [[selectedCategory, filteredItems]] as [string, PublicMenuItem[]][];
    }
    const map = new Map<string, PublicMenuItem[]>();
    for (const item of filteredItems) {
      const cat = item.category || "General";
      map.set(cat, [...(map.get(cat) ?? []), item]);
    }
    return Array.from(map.entries());
  }, [filteredItems, selectedCategory]);

  // Map cart items by plato_id for quick quantity lookup
  const cartQuantities = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of cart) {
      map.set(line.plato_id, line.quantity);
    }
    return map;
  }, [cart]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isTableMode = mode.kind === "table";

  // Automatically open cart drawer if an error or success occurs
  const handleOpenCart = () => setIsCartOpen(true);
  const handleCloseCart = () => setIsCartOpen(false);

  const handleClearCart = () => {
    if (onClearCart) {
      onClearCart();
    } else {
      // Fallback: update each item to 0
      for (const line of cart) {
        onUpdateQuantity(line.plato_id, 0);
      }
    }
  };

  return (
    <div className={publicMenuTheme.canvas} style={publicMenuTheme.rootStyle}>
      {/* Shell: a single column on phones; menu + cart (right) side by side from lg */}
      <div className="flex w-full justify-center lg:mx-auto lg:max-w-[1240px] lg:justify-start">
      <div className={publicMenuTheme.orderColumn} style={publicMenuTheme.rootStyle}>
        {/* Sticky Top Bar */}
        <AppTopBar
          title={settings.title || settings.business_name}
          logoUrl={settings.logo_url}
          mode={mode}
          partySize={partySize}
          cartCount={itemCount}
          onOpenCart={handleOpenCart}
          onChangePartySize={onBackToHome}
        />

        {/* Tab 1: Menú */}
        {activeTab === "menu" && (
          <main
            className={`flex-1 flex flex-col ${
              cart.length > 0
                ? publicMenuTheme.scrollPaddingCart
                : publicMenuTheme.scrollPaddingNoCart
            }`}
          >
            {/* Sticky Category Chips & Search */}
            <CategoryChips
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* Dish List */}
            <section
              aria-label="Platos del menú"
              className="flex-1 px-4 py-3 space-y-5 lg:px-6 lg:py-5"
            >
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    No encontramos platos
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {searchQuery
                      ? `No hay resultados para "${searchQuery}".`
                      : "No hay productos en esta categoría."}
                  </p>
                </div>
              ) : (
                groupedItems.map(([categoryName, categoryDishes]) => (
                  <div key={categoryName} className="space-y-2.5">
                    {selectedCategory === "all" && (
                      <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1 pt-1">
                        {categoryName}
                      </h2>
                    )}
                    <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
                      {categoryDishes.map((item) => (
                        <DishRow
                          key={item.id}
                          item={item}
                          quantityInCart={cartQuantities.get(item.plato_id) ?? 0}
                          onAdd={() => onAddItem(item)}
                          onUpdateQuantity={(q) => onUpdateQuantity(item.plato_id, q)}
                          currency={settings.currency}
                          currencyFormatter={currencyFormatter}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          </main>
        )}

        {/* Tab 2: Servicios / Info */}
        {activeTab === "services" && (
          <main className={`flex-1 ${publicMenuTheme.scrollPaddingNoCart}`}>
            <ServicesTab
              contact={contact}
              isTableMode={isTableMode}
              businessName={settings.title || settings.business_name}
              slug={slug}
              tenantId={tenantId}
              mesa={mode.kind === "table" ? mode.mesa : undefined}
            />
          </main>
        )}

        {/* Floating Cart Summary Bar (Optional app-like summary) */}
        {cart.length > 0 && !isCartOpen && (
          <div
            className="fixed bottom-[68px] left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 z-20 pointer-events-none lg:hidden"
            style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <button
              type="button"
              onClick={handleOpenCart}
              className="pointer-events-auto flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-xs font-bold text-zinc-950 shadow-xl transition active:scale-98 cursor-pointer hover:bg-zinc-100"
            >
              <div className="flex items-center gap-2 whitespace-nowrap">
                <ShoppingBag className="size-4 shrink-0 text-emerald-600" />
                <span>Ver pedido</span>
                <span aria-hidden="true">·</span>
                <span>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>
              <span className="font-extrabold text-sm text-zinc-950 tabular-nums">
                {currencyFormatter(total, settings.currency)}
              </span>
            </button>
          </div>
        )}

        {/* Fixed Bottom Tab Bar */}
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenCart={handleOpenCart}
          cartCount={itemCount}
          isTableMode={isTableMode}
        />
      </div>

        {/* Cart: slide-in panel from the right on phones, permanent right column on wide screens */}
        <CartDrawer
          dockOnDesktop
          isOpen={isCartOpen}
          onClose={handleCloseCart}
          cart={cart}
          onUpdateQuantity={onUpdateQuantity}
          onClearCart={handleClearCart}
          currency={settings.currency}
          isTableMode={isTableMode}
          mesaNumero={isTableMode ? mode.mesa : undefined}
          itemCount={itemCount}
          total={total}
          mesaCodigo={mesaCodigo}
          onMesaCodigoChange={onMesaCodigoChange}
          mesaCodeError={mesaCodeError}
          customerName={customerName}
          onCustomerNameChange={onCustomerNameChange}
          customerPhone={customerPhone}
          onCustomerPhoneChange={onCustomerPhoneChange}
          notes={notes}
          onNotesChange={onNotesChange}
          error={error}
          success={success}
          placing={placing}
          onPlaceOrder={onPlaceOrder}
          onDismissSuccess={onDismissSuccess}
          currencyFormatter={currencyFormatter}
          delivery={delivery}
          onDeliveryChange={onDeliveryChange}
        />
      </div>
    </div>
  );
}
