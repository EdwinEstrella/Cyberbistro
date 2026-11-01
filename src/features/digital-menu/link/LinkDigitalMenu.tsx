import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "../../../shared/lib/supabase";
import { ClosedRestaurantState } from "../components/ClosedRestaurantState";
import { isRestaurantClosedError, RESTAURANT_CLOSED_MESSAGE } from "../lib/onlineStatus";
import { useOnlineMenuStatus } from "../lib/useOnlineMenuStatus";
import { DishExtrasModal } from "./DishExtrasModal";
import {
  addToCart,
  buildCreateOrderPayload,
  calculateCartItemCount,
  calculateCartTotal,
  calculateLineTotal,
  clearCart,
  pruneCart,
  removeLine,
  updateLineExtras,
  updateLineQuantity,
} from "./lib/cart";
import { mapLinkOrderError, mapMenuUnavailableReason } from "./lib/errors";
import { getLinkSessionId } from "./lib/session";
import type {
  CartExtra,
  CartLine,
  CreateOrderResult,
  LinkMenuItem,
  LinkMenuPayload,
} from "./lib/types";

const formatCurrency = (value: number, code: string = "DOP") =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: code === "ARS" ? "ARS" : "DOP",
  }).format(value || 0);

function asLinkMenuPayload(data: unknown): LinkMenuPayload {
  const obj = data as Partial<LinkMenuPayload> | null;
  const rest = obj?.restaurant ?? obj?.settings ?? null;
  return {
    available: Boolean(obj?.available),
    reason: obj?.reason ?? null,
    label: obj?.label ?? null,
    link_type: obj?.link_type === "company" ? "company" : "public",
    allow_extras: Boolean(obj?.allow_extras),
    company_name: obj?.company_name ?? null,
    restaurant: rest
      ? {
          title: rest.title || rest.business_name || "Menú",
          description: rest.description ?? null,
          logo_url: rest.logo_url ?? null,
          banner_url: rest.banner_url ?? null,
          business_name: rest.business_name || "",
          phone: rest.phone ?? null,
          address: rest.address ?? null,
          currency: rest.currency || "DOP",
          theme: rest.theme,
        }
      : null,
    items: Array.isArray(obj?.items) ? obj!.items : [],
    extras: Array.isArray(obj?.extras) ? obj!.extras : [],
  };
}

export function LinkDigitalMenu() {
  const { token = "" } = useParams<{ token: string }>();

  // State
  const [menu, setMenu] = useState<LinkMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Form fields
  const [employeeName, setEmployeeName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [prunedNotice, setPrunedNotice] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<CreateOrderResult | null>(null);

  // Modal for extras
  const [modalDish, setModalDish] = useState<LinkMenuItem | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [modalInitialQty, setModalInitialQty] = useState(1);
  const [modalInitialNotes, setModalInitialNotes] = useState("");
  const [modalInitialExtras, setModalInitialExtras] = useState<CartExtra[]>([]);

  // Session ID
  const sessionId = useMemo(() => (token ? getLinkSessionId(token) : ""), [token]);

  // Online cycle status
  const { isOpen, setIsOpen, checking: isCheckingStatus, checkStatus } = useOnlineMenuStatus({ token });

  // Load menu from RPC
  const loadMenu = useCallback(async () => {
    if (!token) return null;
    setLoading(true);
    setNetworkError(false);

    try {
      const [{ data, error }] = await Promise.all([
        supabase.rpc("get_menu_by_link", {
          p_token: token.trim(),
        }),
        checkStatus(),
      ]);

      if (error) {
        const errorMsg = error.message || "";
        if (
          errorMsg.toLowerCase().includes("failed to fetch") ||
          errorMsg.toLowerCase().includes("network")
        ) {
          setNetworkError(true);
        } else {
          // If RPC fails or returns error, available is false
          setMenu({
            available: false,
            reason: error.message,
            link_type: "public",
            allow_extras: false,
            company_name: null,
            restaurant: null,
            items: [],
            extras: [],
          });
        }
        setLoading(false);
        return null;
      }

      const parsed = asLinkMenuPayload(data);
      setMenu(parsed);
      setLoading(false);
      return parsed;
    } catch {
      setNetworkError(true);
      setLoading(false);
      return null;
    }
  }, [token]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  // Derived catalog items
  const currencyCode = menu?.restaurant?.currency || "DOP";
  const hasExtrasConfigured = Boolean(
    menu?.allow_extras && menu.extras && menu.extras.length > 0
  );

  const filteredItems = useMemo(() => {
    if (!menu?.items) return [];
    if (!searchQuery.trim()) return menu.items;
    const q = searchQuery.toLowerCase();
    return menu.items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [menu?.items, searchQuery]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, LinkMenuItem[]>();
    for (const item of filteredItems) {
      const key = item.category || "General";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [filteredItems]);

  const cartTotal = useMemo(() => calculateCartTotal(cart), [cart]);
  const cartItemCount = useMemo(() => calculateCartItemCount(cart), [cart]);

  // Cart actions
  function handleAddDishClick(dish: LinkMenuItem) {
    setSubmitError(null);
    setPrunedNotice(null);

    if (hasExtrasConfigured) {
      setModalDish(dish);
      setModalMode("add");
      setEditingLineId(null);
      setModalInitialQty(1);
      setModalInitialNotes("");
      setModalInitialExtras([]);
    } else {
      setCart((current) =>
        addToCart(current, {
          plato_id: dish.plato_id,
          name: dish.name,
          price: dish.price,
          quantity: 1,
          extras: [],
        })
      );
    }
  }

  function handleEditExtrasClick(line: CartLine) {
    if (!hasExtrasConfigured || !menu) return;
    const foundDish = menu.items.find((i) => i.plato_id === line.plato_id) ?? {
      id: line.id,
      plato_id: line.plato_id,
      name: line.name,
      description: null,
      image_url: null,
      price: line.price,
      category: "General",
      sort_order: 0,
    };

    setModalDish(foundDish);
    setModalMode("edit");
    setEditingLineId(line.id);
    setModalInitialQty(line.quantity);
    setModalInitialNotes(line.notes || "");
    setModalInitialExtras(line.extras || []);
  }

  function handleModalConfirm(data: {
    quantity: number;
    notes: string;
    extras: CartExtra[];
  }) {
    if (!modalDish) return;

    if (modalMode === "edit" && editingLineId) {
      setCart((current) => {
        const withQty = updateLineQuantity(current, editingLineId, data.quantity);
        const withNotes = withQty.map((l) =>
          l.id === editingLineId ? { ...l, notes: data.notes || undefined } : l
        );
        return updateLineExtras(withNotes, editingLineId, data.extras);
      });
    } else {
      setCart((current) =>
        addToCart(current, {
          plato_id: modalDish.plato_id,
          name: modalDish.name,
          price: modalDish.price,
          quantity: data.quantity,
          notes: data.notes,
          extras: data.extras,
        })
      );
    }
  }

  // Submit order
  async function handlePlaceOrder() {
    if (!menu) return;

    const trimmedName = employeeName.trim();
    if (menu.link_type === "company") {
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        setSubmitError("Por favor ingresa tu nombre (entre 2 y 80 caracteres).");
        return;
      }
    } else if (trimmedName.length > 0 && (trimmedName.length < 2 || trimmedName.length > 80)) {
      setSubmitError("El nombre debe tener entre 2 y 80 caracteres.");
      return;
    }

    if (cart.length === 0) {
      setSubmitError("Agrega al menos un plato a tu pedido.");
      return;
    }

    if (notes.trim().length > 500) {
      setSubmitError("Las notas del pedido no pueden superar los 500 caracteres.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setPrunedNotice(null);

    const payload = buildCreateOrderPayload(
      token,
      trimmedName || (menu.link_type === "company" ? "" : null),
      notes,
      cart,
      sessionId
    );

    try {
      const { data, error } = await supabase.rpc("create_order_by_link", payload);

      if (error) {
        const errorText = error.message || "";
        const upper = errorText.toUpperCase();

        if (isRestaurantClosedError(errorText)) {
          setIsOpen(false);
          setSubmitError(RESTAURANT_CLOSED_MESSAGE);
          setSubmitting(false);
          return;
        }

        if (
          upper.includes("ITEM_SOLD_OUT") ||
          upper.includes("ITEM_NOT_AVAILABLE") ||
          upper.includes("MENU_NOT_AVAILABLE")
        ) {
          // Reload the menu and prune unavailable lines
          const freshMenu = await loadMenu();
          if (freshMenu && freshMenu.available) {
            const { prunedCart, removedLines, removedExtras } = pruneCart(
              cart,
              freshMenu.items,
              freshMenu.extras
            );
            setCart(prunedCart);

            const droppedItems = [...removedLines, ...removedExtras];
            if (droppedItems.length > 0) {
              setPrunedNotice(
                `Uno de los productos se agotó; recargamos el menú. Se eliminó de tu pedido: ${droppedItems.join(", ")}`
              );
            }
          }
        }

        setSubmitError(mapLinkOrderError(errorText));
        setSubmitting(false);
        return;
      }

      const res = data as CreateOrderResult | null;
      setSuccessOrder({
        order_id: res?.order_id || "",
        numero_pedido: res?.numero_pedido ?? 0,
        total: Number(res?.total ?? cartTotal),
      });
      setCart(clearCart());
      setNotes("");
      setShowMobileCart(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRestaurantClosedError(msg)) {
        setIsOpen(false);
        setSubmitError(RESTAURANT_CLOSED_MESSAGE);
      } else {
        setSubmitError(mapLinkOrderError(msg));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetOrder() {
    setSuccessOrder(null);
    setCart(clearCart());
    setNotes("");
    setSubmitError(null);
    setPrunedNotice(null);
  }

  // 1. Loading state
  if ((loading && isOpen === null) && !menu && !networkError) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="space-y-4">
          <div className="size-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-orange-100/70">Cargando menú...</p>
        </div>
      </div>
    );
  }

  // 1b. Closed restaurant state (no open operational cycle)
  if (isOpen === false) {
    return (
      <ClosedRestaurantState
        title={menu?.restaurant?.title}
        logoUrl={menu?.restaurant?.logo_url}
        onRetry={() => void loadMenu()}
        isRetrying={loading || isCheckingStatus}
      />
    );
  }

  // 2. Network error state
  if (networkError) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="max-w-md w-full rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl">
          <p className="text-4xl mb-4">📡</p>
          <h1 className="text-2xl font-black mb-3">Sin conexión</h1>
          <p className="text-sm text-orange-100/70 mb-6">
            Sin conexión. Este menú necesita internet.
          </p>
          <button
            type="button"
            onClick={() => void loadMenu()}
            className="w-full rounded-2xl bg-[#ff906d] px-5 py-3 text-sm font-black uppercase tracking-wider text-[#24120b] hover:bg-[#ff825b] transition cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // 3. Unavailable state
  if (!menu || !menu.available) {
    const restaurantTitle = menu?.restaurant?.title || "Menú";
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="max-w-md w-full rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl">
          {menu?.restaurant?.logo_url && (
            <img
              src={menu.restaurant.logo_url}
              alt="Logo"
              className="mx-auto size-20 rounded-2xl object-contain bg-white/10 p-2 mb-4"
            />
          )}
          <h1 className="text-2xl font-black mb-2">{restaurantTitle}</h1>
          <p className="text-sm uppercase tracking-wider text-orange-200/70 font-bold mb-4">
            Menú no disponible
          </p>
          <p className="text-sm text-orange-100/80 leading-relaxed">
            {mapMenuUnavailableReason(menu?.reason)}
          </p>
        </div>
      </div>
    );
  }

  // 4. Success screen
  if (successOrder) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="max-w-md w-full rounded-[32px] border border-emerald-400/20 bg-emerald-950/20 p-8 shadow-2xl backdrop-blur">
          <div className="size-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-3xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-2xl font-black text-emerald-200">
            Pedido #{successOrder.numero_pedido} enviado
          </h1>
          <p className="mt-3 text-sm text-orange-100/70">
            Tu pedido ha sido recibido y está pendiente de confirmación.
          </p>
          <div className="my-6 rounded-2xl bg-white/5 border border-white/10 p-4">
            <span className="text-xs uppercase tracking-wider text-orange-200/70 font-semibold block mb-1">
              Total del pedido
            </span>
            <span className="text-2xl font-black text-orange-200">
              {formatCurrency(successOrder.total, currencyCode)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleResetOrder}
            className="w-full rounded-2xl bg-[#ff906d] px-5 py-3.5 text-sm font-black uppercase tracking-wider text-[#24120b] hover:bg-[#ff825b] transition cursor-pointer"
          >
            Hacer otro pedido
          </button>
        </div>
      </div>
    );
  }

  const restaurant = menu.restaurant;

  // Render main menu & cart
  return (
    <div className="min-h-screen bg-[#15100c] text-[#fff7ed]">
      {/* Header */}
      <header className="relative overflow-hidden px-4 py-8 sm:px-8">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, #ff906d 0, transparent 28%), radial-gradient(circle at 90% 5%, #facc15 0, transparent 22%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl rounded-[36px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {restaurant?.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt="Logo"
                  className="size-16 rounded-2xl object-contain bg-white/10 p-2 shrink-0"
                />
              ) : (
                <div className="size-16 rounded-2xl bg-orange-300/20 shrink-0 flex items-center justify-center text-2xl font-black text-orange-200">
                  🍽
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-orange-200/80 font-bold">
                  Menú digital
                </p>
                <h1 className="text-2xl font-black sm:text-4xl tracking-tight">
                  {restaurant?.title}
                </h1>
              </div>
            </div>

            <div className="text-xs text-orange-100/70 sm:text-right space-y-1">
              {restaurant?.address && <p>{restaurant.address}</p>}
              {restaurant?.phone && <p>{restaurant.phone}</p>}
            </div>
          </div>

          {restaurant?.description && (
            <p className="mt-4 max-w-2xl text-xs sm:text-sm leading-relaxed text-orange-50/75">
              {restaurant.description}
            </p>
          )}

          {/* Badges */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {menu.link_type === "company" && menu.company_name && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/30 bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-200">
                🏢 Menú para {menu.company_name}
              </span>
            )}
            {menu.label && menu.link_type !== "company" && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-orange-100/70">
                {menu.label}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 lg:grid-cols-[1fr_360px] lg:px-8">
        {/* Menu catalog */}
        <section className="space-y-6">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              aria-label="Buscar platos o categorías"
              placeholder="Buscar platos, categorías o ingredientes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 pl-12 text-sm outline-none transition focus:border-orange-300/50 focus:bg-white/10 placeholder:text-orange-50/40 text-[#fff7ed]"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-50/40 size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-50/40 hover:text-orange-200 transition cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Grouped items */}
          {groupedItems.length === 0 ? (
            <div className="text-center py-12 rounded-3xl border border-white/10 bg-white/[0.02]">
              <p className="text-orange-100/60 text-sm">
                {searchQuery
                  ? `No se encontraron resultados para "${searchQuery}".`
                  : "No hay platos disponibles en este momento."}
              </p>
            </div>
          ) : (
            groupedItems.map(([category, items]) => (
              <div key={category} className="space-y-4">
                <h2 className="text-lg font-black uppercase tracking-[0.16em] text-orange-200">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {items.map((dish) => (
                    <article
                      key={dish.id}
                      className="rounded-[28px] border border-white/10 bg-white/[0.05] p-4 shadow-xl flex flex-col justify-between"
                    >
                      <div>
                        {dish.image_url && (
                          <img
                            src={dish.image_url}
                            alt={dish.name}
                            className="mb-3 h-36 w-full rounded-2xl object-cover bg-black/20"
                          />
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-black text-base">{dish.name}</h3>
                          <strong className="whitespace-nowrap text-orange-200 text-sm font-extrabold">
                            {formatCurrency(dish.price, currencyCode)}
                          </strong>
                        </div>
                        {dish.description && (
                          <p className="mt-1 text-xs text-orange-50/65 line-clamp-3 leading-relaxed">
                            {dish.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddDishClick(dish)}
                        aria-label={`Agregar ${dish.name} al pedido`}
                        className="mt-4 w-full rounded-2xl bg-[#ff906d] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#24120b] shadow-md hover:bg-[#ff825b] transition cursor-pointer"
                      >
                        {hasExtrasConfigured ? "Agregar / Extras" : "Agregar"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Desktop Sticky Cart Aside */}
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
          <CartPanel
            menu={menu}
            cart={cart}
            cartTotal={cartTotal}
            cartItemCount={cartItemCount}
            employeeName={employeeName}
            onEmployeeNameChange={setEmployeeName}
            notes={notes}
            onNotesChange={setNotes}
            submitting={submitting}
            submitError={submitError}
            prunedNotice={prunedNotice}
            currencyCode={currencyCode}
            hasExtrasConfigured={hasExtrasConfigured}
            onUpdateQuantity={(id, q) => setCart((c) => updateLineQuantity(c, id, q))}
            onRemoveLine={(id) => setCart((c) => removeLine(c, id))}
            onEditExtras={handleEditExtrasClick}
            onSubmit={handlePlaceOrder}
          />
        </aside>
      </main>

      {/* Mobile Floating Cart Button */}
      {cart.length > 0 && !showMobileCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobileCart(true)}
            aria-label="Ver pedido"
            className="flex items-center gap-3 rounded-full bg-[#ff906d] px-6 py-4 font-black text-sm text-[#24120b] shadow-2xl hover:bg-[#ff825b] transition cursor-pointer"
          >
            <span>🛒 {cartItemCount} items</span>
            <span>·</span>
            <span>{formatCurrency(cartTotal, currencyCode)}</span>
          </button>
        </div>
      )}

      {/* Mobile Cart Slide-over / Modal */}
      {showMobileCart && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tu pedido"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-sm lg:hidden"
        >
          <div className="w-full rounded-t-[32px] border-t border-white/10 bg-[#21150f] p-5 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h2 className="text-lg font-black">Tu pedido</h2>
              <button
                type="button"
                onClick={() => setShowMobileCart(false)}
                aria-label="Cerrar pedido"
                className="size-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <CartPanel
                menu={menu}
                cart={cart}
                cartTotal={cartTotal}
                cartItemCount={cartItemCount}
                employeeName={employeeName}
                onEmployeeNameChange={setEmployeeName}
                notes={notes}
                onNotesChange={setNotes}
                submitting={submitting}
                submitError={submitError}
                prunedNotice={prunedNotice}
                currencyCode={currencyCode}
                hasExtrasConfigured={hasExtrasConfigured}
                onUpdateQuantity={(id, q) => setCart((c) => updateLineQuantity(c, id, q))}
                onRemoveLine={(id) => setCart((c) => removeLine(c, id))}
                onEditExtras={handleEditExtrasClick}
                onSubmit={handlePlaceOrder}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dish & Extras Config Modal */}
      <DishExtrasModal
        isOpen={Boolean(modalDish)}
        onClose={() => setModalDish(null)}
        dish={modalDish}
        availableExtras={menu.extras || []}
        currencyCode={currencyCode}
        initialQuantity={modalInitialQty}
        initialNotes={modalInitialNotes}
        initialExtras={modalInitialExtras}
        mode={modalMode}
        onConfirm={handleModalConfirm}
      />
    </div>
  );
}

interface CartPanelProps {
  menu: LinkMenuPayload;
  cart: CartLine[];
  cartTotal: number;
  cartItemCount: number;
  employeeName: string;
  onEmployeeNameChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  submitting: boolean;
  submitError: string | null;
  prunedNotice: string | null;
  currencyCode: string;
  hasExtrasConfigured: boolean;
  onUpdateQuantity: (lineId: string, qty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onEditExtras: (line: CartLine) => void;
  onSubmit: () => void;
}

function CartPanel({
  menu,
  cart,
  cartTotal,
  cartItemCount,
  employeeName,
  onEmployeeNameChange,
  notes,
  onNotesChange,
  submitting,
  submitError,
  prunedNotice,
  currencyCode,
  hasExtrasConfigured,
  onUpdateQuantity,
  onRemoveLine,
  onEditExtras,
  onSubmit,
}: CartPanelProps) {
  const isCompany = menu.link_type === "company";
  const requireRoster = Boolean(menu.require_roster);
  const companyName = menu.company_name || menu.label || "tu empresa";

  return (
    <div className="rounded-[32px] border border-white/10 bg-[#21150f] p-5 shadow-2xl text-[#fff7ed]">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <h2 className="text-lg font-black">Tu pedido</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-orange-200">
          {cartItemCount} items
        </span>
      </div>

      {/* Cart lines */}
      <div className="mt-4 space-y-3 max-h-[38vh] overflow-y-auto pr-1">
        {cart.length === 0 ? (
          <p className="text-xs text-orange-100/60 py-4 text-center">
            Agrega platos del menú para completar tu pedido.
          </p>
        ) : (
          cart.map((line) => {
            const lineTotal = calculateLineTotal(line);
            return (
              <div
                key={line.id}
                className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm leading-snug">{line.name}</span>
                  <span className="text-xs font-black text-orange-200 whitespace-nowrap">
                    {formatCurrency(lineTotal, currencyCode)}
                  </span>
                </div>

                {/* Extras list if any */}
                {line.extras && line.extras.length > 0 && (
                  <div className="pl-2 border-l border-orange-300/20 space-y-0.5 text-xs text-orange-100/70">
                    {line.extras.map((ex) => (
                      <div key={ex.plato_id} className="flex justify-between">
                        <span>+ {ex.quantity}x {ex.name}</span>
                        <span>{formatCurrency(ex.price * ex.quantity, currencyCode)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Line notes */}
                {line.notes && (
                  <p className="text-xs italic text-orange-100/50">"{line.notes}"</p>
                )}

                {/* Controls */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
                      aria-label={`Disminuir ${line.name}`}
                      className="size-7 rounded-full border border-white/10 bg-white/5 text-white flex items-center justify-center text-sm font-bold hover:bg-white/15"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-bold text-xs">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                      disabled={line.quantity >= 50}
                      aria-label={`Aumentar ${line.name}`}
                      className="size-7 rounded-full border border-white/10 bg-white/5 text-white flex items-center justify-center text-sm font-bold hover:bg-white/15 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasExtrasConfigured && (
                      <button
                        type="button"
                        onClick={() => onEditExtras(line)}
                        aria-label={`Modificar extras para ${line.name}`}
                        className="text-xs text-orange-300 hover:text-orange-200 underline font-semibold cursor-pointer"
                      >
                        {line.extras && line.extras.length > 0
                          ? "Editar extras"
                          : "Agregar extras"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.id)}
                      aria-label={`Eliminar ${line.name}`}
                      className="text-xs text-red-300/80 hover:text-red-300 font-semibold cursor-pointer ml-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Cart total */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
        <span className="font-bold text-sm">Total</span>
        <span className="text-lg font-black text-orange-200">
          {formatCurrency(cartTotal, currencyCode)}
        </span>
      </div>

      {/* Notices & Errors */}
      {prunedNotice && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/15 p-3 text-xs text-amber-200 leading-snug">
          {prunedNotice}
        </div>
      )}

      {submitError && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-xs text-red-200 leading-snug">
          {submitError}
        </div>
      )}

      {/* Checkout Form */}
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="customer-name-input" className="block text-xs font-bold text-orange-100/80 mb-1">
            {requireRoster ? "Tu cédula o nombre registrado" : <>Tu nombre {isCompany && <span className="text-orange-400">*</span>}</>}
          </label>
          {requireRoster && (
            <p className="text-[11px] text-orange-200/70 mb-1.5 leading-snug">
              Solo empleados autorizados por {companyName} pueden pedir.
            </p>
          )}
          <input
            id="customer-name-input"
            type="text"
            required={isCompany || requireRoster}
            aria-label={requireRoster ? "Tu cédula o nombre registrado" : "Tu nombre"}
            placeholder={
              requireRoster
                ? "Ej. 402-1234567-8 o María Rodríguez"
                : isCompany
                ? "Ej. María Rodríguez (requerido)"
                : "Ej. María Rodríguez (opcional)"
            }
            value={employeeName}
            onChange={(e) => onEmployeeNameChange(e.target.value.slice(0, 80))}
            maxLength={80}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#fff7ed] outline-none focus:border-orange-300/50 focus:bg-white/10 placeholder:text-orange-50/30 transition"
          />
        </div>

        <div>
          <label htmlFor="order-notes-input" className="block text-xs font-bold text-orange-100/80 mb-1">
            Notas del pedido (opcional)
          </label>
          <textarea
            id="order-notes-input"
            aria-label="Notas del pedido"
            placeholder="Instrucciones generales de entrega..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={2}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#fff7ed] outline-none focus:border-orange-300/50 focus:bg-white/10 placeholder:text-orange-50/30 transition resize-none"
          />
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || cart.length === 0}
          aria-label="Enviar pedido"
          className="w-full rounded-2xl bg-[#ff906d] px-4 py-3.5 text-xs font-black uppercase tracking-wider text-[#24120b] shadow-lg hover:bg-[#ff825b] transition disabled:opacity-40 cursor-pointer"
        >
          {submitting ? "Enviando pedido..." : "Enviar pedido"}
        </button>
      </div>
    </div>
  );
}
