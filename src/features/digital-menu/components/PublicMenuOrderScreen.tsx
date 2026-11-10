import { useMemo, useState } from "react";
import { ArrowLeft, Search, ShoppingBag, X } from "lucide-react";
import type { PublicMenuMode } from "../lib/publicMenuMode";
import { DishImage } from "./DishImage";
import { PublicMenuCartPanel } from "./PublicMenuCartPanel";

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
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  mesaCodigo: string;
  onMesaCodigoChange: (val: string) => void;
  mesaCodeError: string | null;
  error: string | null;
  success: { message: string; numeroPedido: number | null } | null;
  placing: boolean;
  onPlaceOrder: () => void;
  onBackToHome: () => void;
  currencyFormatter: (value: number, code: string) => string;
}

export function PublicMenuOrderScreen({
  settings,
  mode,
  partySize,
  items,
  cart,
  onAddItem,
  onUpdateQuantity,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  notes,
  onNotesChange,
  mesaCodigo,
  onMesaCodigoChange,
  mesaCodeError,
  error,
  success,
  placing,
  onPlaceOrder,
  onBackToHome,
  currencyFormatter,
}: PublicMenuOrderScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileCart, setShowMobileCart] = useState(false);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const lq = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(lq) ||
        item.description?.toLowerCase().includes(lq) ||
        item.category.toLowerCase().includes(lq)
    );
  }, [items, searchQuery]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PublicMenuItem[]>();
    for (const item of filteredItems) {
      const key = item.category || "General";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [filteredItems]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isTableMode = mode.kind === "table";

  return (
    <div className="min-h-dvh bg-[#15100c] text-[#fff7ed]">
      {/* Header */}
      <header className="relative overflow-hidden px-4 py-6 sm:px-8">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, #ff906d 0, transparent 28%), radial-gradient(circle at 90% 5%, #facc15 0, transparent 22%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-black/40 p-5 sm:p-6 shadow-2xl backdrop-blur">
          {/* Navigation bar with Back control */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-orange-200/90 transition hover:bg-white/15 hover:text-white cursor-pointer active:scale-95"
            >
              <ArrowLeft className="size-4" />
              <span>Volver al inicio</span>
            </button>

            {/* Context badge */}
            {isTableMode ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-xl border border-orange-300/30 bg-orange-500/20 px-3 py-1.5 text-xs font-black text-orange-200">
                🪑 Mesa {mode.mesa}
                {partySize ? ` · ${partySize} ${partySize === 1 ? "persona" : "personas"}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center whitespace-nowrap rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-black text-orange-200">
                🛍 Para llevar
              </span>
            )}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="size-14 sm:size-16 rounded-2xl object-contain bg-white/10 p-2 shadow"
                />
              ) : (
                <div className="flex size-14 sm:size-16 items-center justify-center rounded-2xl bg-orange-500/20 text-2xl font-black text-orange-200">
                  {settings.title?.charAt(0) || "R"}
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-orange-200/75">
                  Menú digital
                </p>
                <h1 className="text-2xl font-black tracking-tight sm:text-4xl">
                  {settings.title}
                </h1>
              </div>
            </div>
            <div className="text-xs text-orange-100/75 sm:text-right">
              {settings.address && <p>{settings.address}</p>}
              {settings.phone && <p>{settings.phone}</p>}
            </div>
          </div>
          {settings.description && (
            <p className="mt-3 max-w-2xl text-xs sm:text-sm leading-relaxed text-orange-50/80">
              {settings.description}
            </p>
          )}
        </div>
      </header>

      <main
        className={`mx-auto grid max-w-6xl gap-6 px-4 ${
          cart.length > 0 ? "pb-36 sm:pb-40" : "pb-28"
        } lg:pb-28 lg:grid-cols-[1fr_360px] lg:px-8`}
      >
        {/* Menu items */}
        <section className="space-y-6">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar en el menú"
              aria-label="Buscar platos, categorías o ingredientes en el menú"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 pl-12 text-sm outline-none transition focus:border-orange-300/50 focus:bg-white/10 placeholder:text-orange-50/40"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-50/40 size-5" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-50/40 hover:text-orange-200 transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            )}
          </div>

          {groupedItems.length === 0 && searchQuery ? (
            <div className="text-center py-10">
              <p className="text-orange-50/60">No se encontraron resultados para "{searchQuery}".</p>
            </div>
          ) : (
            groupedItems.map(([category, categoryItems]) => (
              <div key={category}>
                <h2 className="mb-4 text-lg sm:text-xl font-black uppercase tracking-[0.16em] text-orange-200">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {categoryItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-xl flex flex-col justify-between"
                    >
                      <div>
                        <DishImage src={item.image_url} alt={item.name} />
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-base sm:text-lg font-black">{item.name}</h3>
                            {item.description && (
                              <p className="mt-1 text-xs sm:text-sm leading-5 text-orange-50/65">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <strong className="whitespace-nowrap text-orange-200">
                            {currencyFormatter(item.price, settings.currency)}
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddItem(item)}
                        className="mt-4 w-full rounded-2xl border-0 bg-[#ff906d] px-4 py-3 text-sm font-black uppercase tracking-widest text-[#24120b] shadow-lg transition hover:bg-[#ff9f80] active:scale-98 cursor-pointer"
                      >
                        Agregar
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Cart panel */}
        <PublicMenuCartPanel
          cart={cart}
          currency={settings.currency}
          isTableMode={isTableMode}
          mesaNumero={isTableMode ? mode.mesa : undefined}
          itemCount={itemCount}
          total={total}
          showMobileCart={showMobileCart}
          onCloseMobileCart={() => setShowMobileCart(false)}
          onUpdateQuantity={onUpdateQuantity}
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
          currencyFormatter={currencyFormatter}
        />
      </main>

      {/* Mobile floating cart button */}
      {cart.length > 0 && !showMobileCart && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 lg:hidden z-40"
          style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => setShowMobileCart(true)}
            className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap rounded-full bg-[#ff906d] px-6 py-4 font-black text-[#24120b] shadow-2xl cursor-pointer active:scale-95 transition"
          >
            <ShoppingBag className="size-5 shrink-0" />
            <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
            <span aria-hidden="true">·</span>
            <span>{currencyFormatter(total, settings.currency)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
