import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { PublicMenuMode } from "../lib/publicMenuMode";
import type { PublicContact } from "../../menu-links/lib/publicMenuCalendar";
import type { DeliveryDraft } from "../lib/deliveryOrder";
import { AppTopBar } from "./public-app/AppTopBar";
import { CategoryChips } from "./public-app/CategoryChips";
import { DishRow } from "./public-app/DishRow";
import { BottomTabBar } from "./public-app/BottomTabBar";
import { CartDrawer } from "./public-app/CartDrawer";
import { DishDetailSheet } from "./public-app/DishDetailSheet";
import { ServicesTab } from "./public-app/ServicesTab";
import { FloatingCartBar } from "./public-app/FloatingCartBar";
import { RecentlyOrderedSection } from "./public-app/RecentlyOrderedSection";
import { publicMenuTheme } from "./public-app/publicMenuTheme";
import { filterDishesByName } from "../lib/searchDishes";
import { resolveRecentDishes, type RecentDish } from "../lib/recentDishes";

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
  onPartySizeChange: (size: number) => void;
  items: PublicMenuItem[];
  cart: CartLine[];
  onAddItem: (item: PublicMenuItem) => void;
  onAddItemWithDetails: (item: PublicMenuItem, quantity: number, note?: string) => void;
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
  onDismissSuccess?: () => void;
  contact?: PublicContact | null;
  currencyFormatter: (value: number, code: string) => string;
  slug?: string;
  tenantId?: string | null;
  isOpen?: boolean | null;
  /** Dishes this device ordered before from this menu, newest first. */
  recentDishes?: RecentDish[];
}

export function PublicMenuOrderScreen({
  settings,
  mode,
  partySize,
  onPartySizeChange,
  items,
  cart,
  onAddItem,
  onAddItemWithDetails,
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
  onDismissSuccess,
  contact,
  currencyFormatter,
  slug,
  tenantId,
  isOpen = true,
  recentDishes = [],
}: PublicMenuOrderScreenProps) {
  const [activeTab, setActiveTab] = useState<"menu" | "services">("menu");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedDishForDetail, setSelectedDishForDetail] = useState<PublicMenuItem | null>(null);

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

  // Filter items based on selected category and pure case/accent-insensitive name search
  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedCategory !== "all") {
      result = result.filter((item) => (item.category || "General") === selectedCategory);
    }

    if (searchQuery.trim()) {
      result = filterDishesByName(result, searchQuery);
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

  const now = useMemo(() => new Date(), []);
  const recentEntries = useMemo(
    () => resolveRecentDishes(recentDishes, items),
    [recentDishes, items]
  );

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
          {/* Sticky Top Bar: restaurant name (Space Grotesk 22px/800), open dot status, mode toggle */}
          <AppTopBar
            title={settings.title || settings.business_name}
            logoUrl={settings.logo_url}
            mode={mode}
            partySize={partySize}
            cartCount={itemCount}
            onOpenCart={handleOpenCart}
            isOpen={isOpen}
            delivery={delivery}
            onDeliveryChange={onDeliveryChange}
          />

          {/* Invalid mesa notice in takeout mode */}
          {mode.kind === "takeout" && mode.invalidMesa && (
            <div className="px-4 pt-3">
              <div
                role="status"
                className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-300 shadow-md"
              >
                <AlertTriangle className="size-5 shrink-0 text-amber-400" />
                <span>El QR de esta mesa no es válido; podés pedir para llevar.</span>
              </div>
            </div>
          )}

          {/* Tab 1: Menú / Inicio */}
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

              {selectedCategory === "all" && !searchQuery.trim() && (
                <RecentlyOrderedSection
                  entries={recentEntries}
                  now={now}
                  currency={settings.currency}
                  currencyFormatter={currencyFormatter}
                  onRepeat={onAddItem}
                  onSelect={setSelectedDishForDetail}
                />
              )}

              {/* Dish List */}
              <section
                aria-label="Platos del menú"
                className="flex-1 px-4 py-3 space-y-5 lg:px-6 lg:py-5"
              >
                {filteredItems.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm font-semibold text-[#fafafa]">
                      No encontramos platos
                    </p>
                    <p className="mt-1 text-xs text-[#adaaaa]">
                      {searchQuery
                        ? `No hay resultados para "${searchQuery}".`
                        : "No hay productos en esta categoría."}
                    </p>
                  </div>
                ) : (
                  groupedItems.map(([categoryName, categoryDishes]) => (
                    <div key={categoryName} className="space-y-2.5">
                      {selectedCategory === "all" && (
                        <h2 className={`text-[18px] font-extrabold tracking-[-0.02em] text-[#fafafa] ${publicMenuTheme.headingFontClass}`}>
                          {categoryName}
                        </h2>
                      )}
                      <div className="flex flex-col gap-[10px] lg:grid lg:grid-cols-2 lg:gap-3">
                        {categoryDishes.map((item) => (
                          <DishRow
                            key={item.id}
                            item={item}
                            quantityInCart={cartQuantities.get(item.plato_id) ?? 0}
                            onAdd={() => onAddItem(item)}
                            onUpdateQuantity={(q) => onUpdateQuantity(item.plato_id, q)}
                            onSelect={() => setSelectedDishForDetail(item)}
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

          {/* Floating Cart Summary Bar above tab bar: coral rounded-full */}
          <FloatingCartBar
            itemCount={itemCount}
            total={total}
            currency={settings.currency}
            currencyFormatter={currencyFormatter}
            onOpenCart={handleOpenCart}
            visible={!isCartOpen}
          />

          {/* Fixed Bottom Tab Bar: Inicio / Mis pedidos / Servicios */}
          <BottomTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onOpenCart={handleOpenCart}
            cartCount={itemCount}
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
          partySize={partySize}
          onPartySizeChange={onPartySizeChange}
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

        {/* Dish Detail Bottom Sheet */}
        <DishDetailSheet
          key={selectedDishForDetail?.plato_id ?? "none"}
          isOpen={Boolean(selectedDishForDetail)}
          item={selectedDishForDetail}
          onClose={() => setSelectedDishForDetail(null)}
          onAddWithDetails={onAddItemWithDetails}
          initialNotes={
            cart.find((line) => line.plato_id === selectedDishForDetail?.plato_id)?.notes
          }
          currency={settings.currency}
          currencyFormatter={currencyFormatter}
        />
      </div>
    </div>
  );
}
