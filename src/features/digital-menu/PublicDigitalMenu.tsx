import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { insforgeClient } from "../../shared/lib/insforge";

// ── Types ─────────────────────────────────────────────────────────────────────

type PublicMenuSettings = {
  tenant_id: string;
  public_slug: string;
  title: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  business_name: string;
  phone: string | null;
  address: string | null;
  currency: "DOP" | "ARS" | string;
};

type PublicMenuItem = {
  id: string;
  plato_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category: string;
  sort_order: number;
};

type PublicMenuPayload = {
  settings: PublicMenuSettings | null;
  items: PublicMenuItem[];
  cantidad_mesas: number;
};

type CartLine = PublicMenuItem & { quantity: number; notes?: string };

type OrderType = "takeout" | "in_store";

// ── Helpers ───────────────────────────────────────────────────────────────────

const currency = (value: number, code: string) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: code === "ARS" ? "ARS" : "DOP",
  }).format(value || 0);

function asMenuPayload(value: unknown): PublicMenuPayload {
  const payload = value as Partial<PublicMenuPayload> | null;
  return {
    settings: payload?.settings ?? null,
    items: Array.isArray(payload?.items) ? payload.items : [],
    cantidad_mesas: Number(payload?.cantidad_mesas ?? 0),
  };
}

/**
 * Returns or creates a stable per-tenant session ID stored in localStorage.
 * This is used to prevent a browser from placing multiple active in-store orders.
 */
function getClientSessionId(slug: string): string {
  const key = `cb_session_${slug}`;
  const stored = localStorage.getItem(key);
  if (stored && stored.length > 0) return stored;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, id);
  return id;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PublicDigitalMenu() {
  const { slug = "" } = useParams();

  const [menu, setMenu] = useState<PublicMenuPayload>({ settings: null, items: [], cantidad_mesas: 0 });
  const [cart, setCart] = useState<CartLine[]>([]);

  // Customer context
  const [orderType, setOrderType] = useState<OrderType | null>(null); // null = not decided yet
  const [selectedMesa, setSelectedMesa] = useState<number | null>(null);
  const [mesaCodigo, setMesaCodigo] = useState("");
  const [mesaCodeError, setMesaCodeError] = useState<string | null>(null);
  const [showCartPanel, setShowCartPanel] = useState(false);

  // Active in-store order blocking
  const [hasActiveInStoreOrder, setHasActiveInStoreOrder] = useState(false);

  // Order form fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; numeroPedido: number | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Stable session ID ────────────────────────────────────────────────────
  const clientSessionId = useMemo(() => (slug ? getClientSessionId(slug) : ""), [slug]);

  // ── Load menu from RPC ───────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: rpcError } = await insforgeClient.database.rpc(
        "get_public_digital_menu",
        { p_public_slug: slug }
      );
      if (!active) return;
      if (rpcError) {
        setError(rpcError.message || "No se pudo cargar el menú.");
        setLoading(false);
        return;
      }
      setMenu(asMenuPayload(data));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [slug]);

  // ── Realtime: refresh menu on changes ───────────────────────────────────
  useEffect(() => {
    if (!menu.settings?.tenant_id) return;
    const channelName = `digital_menu:${menu.settings.tenant_id}`;
    let active = true;

    const setupRealtime = async () => {
      await insforgeClient.realtime.connect();
      const sub = await insforgeClient.realtime.subscribe(channelName);
      if (!sub.ok) { console.error("Realtime sub error:", sub.error); return; }
    };

    const handleMenuChanged = (msg: unknown) => {
      if (!active) return;
      const m = msg as { meta?: { channel?: string } } | null;
      if (m?.meta?.channel && !m.meta.channel.includes(channelName)) return;
      void insforgeClient.database
        .rpc("get_public_digital_menu", { p_public_slug: slug })
        .then(({ data, error }) => {
          if (!error && active) setMenu(asMenuPayload(data));
        });
    };

    insforgeClient.realtime.on("menu_changed", handleMenuChanged);
    void setupRealtime();

    return () => {
      active = false;
      insforgeClient.realtime.off("menu_changed", handleMenuChanged);
      insforgeClient.realtime.unsubscribe(channelName);
    };
  }, [menu.settings?.tenant_id, slug]);

  // ── Check if this browser session already has an active in-store order ──
  useEffect(() => {
    if (!menu.settings?.tenant_id || !clientSessionId) return;

    void insforgeClient.database
      .from("digital_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", menu.settings.tenant_id)
      .eq("client_session_id", clientSessionId)
      .eq("status", "pending")
      .then(({ count }) => {
        setHasActiveInStoreOrder((count ?? 0) > 0);
      });
  }, [menu.settings?.tenant_id, clientSessionId, success]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return menu.items;
    const lq = searchQuery.toLowerCase();
    return menu.items.filter(
      (item) =>
        item.name.toLowerCase().includes(lq) ||
        item.description?.toLowerCase().includes(lq) ||
        item.category.toLowerCase().includes(lq)
    );
  }, [menu.items, searchQuery]);

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

  // Available table numbers: 1 .. cantidad_mesas
  const tableNumbers = useMemo(
    () => Array.from({ length: menu.cantidad_mesas }, (_, i) => i + 1),
    [menu.cantidad_mesas]
  );

  // ── Cart actions ─────────────────────────────────────────────────────────

  function addItem(item: PublicMenuItem) {
    setSuccess(null);
    setCart((current) => {
      const existing = current.find((line) => line.plato_id === item.plato_id);
      if (existing) {
        return current.map((line) =>
          line.plato_id === item.plato_id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function updateQuantity(platoId: number, quantity: number) {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.plato_id !== platoId) return [line];
        if (quantity <= 0) return [];
        return [{ ...line, quantity }];
      })
    );
  }

  // ── Place order ──────────────────────────────────────────────────────────

  async function placeOrder() {
    if (!customerName.trim()) {
      setError("Indicá tu nombre para confirmar el pedido.");
      return;
    }
    if (cart.length === 0) {
      setError("Agregá al menos un producto al carrito.");
      return;
    }
    if (orderType === "in_store") {
      if (!selectedMesa) {
        setError("Seleccioná tu mesa.");
        return;
      }
      if (mesaCodigo.trim().length !== 4 || !/^\d{4}$/.test(mesaCodigo.trim())) {
        setError("El código de mesa debe ser de 4 dígitos.");
        return;
      }
    }

    setPlacing(true);
    setError(null);
    setMesaCodeError(null);

    const rpcArgs: Record<string, unknown> = {
      p_public_slug: slug,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim() || null,
      p_notes: notes.trim() || null,
      p_items: cart.map((line) => ({
        plato_id: line.plato_id,
        quantity: line.quantity,
        notes: line.notes ?? null,
      })),
      p_order_type: orderType ?? "takeout",
      p_mesa_numero: orderType === "in_store" ? selectedMesa : null,
      p_mesa_codigo: orderType === "in_store" ? mesaCodigo.trim() : null,
      p_client_session_id: clientSessionId || null,
    };

    const { data, error: rpcError } = await insforgeClient.database.rpc(
      "create_public_digital_order",
      rpcArgs as Parameters<typeof insforgeClient.database.rpc>[1]
    );

    setPlacing(false);

    if (rpcError) {
      const msg = rpcError.message || "No se pudo enviar el pedido.";
      if (msg.toLowerCase().includes("código de mesa incorrecto")) {
        setMesaCodeError("Código incorrecto. Verificá el código en la mesa.");
      } else {
        setError(msg);
      }
      return;
    }

    const result = data as { order_id?: string; total?: number; numero_pedido?: number } | null;
    const orderTotal = Number(result?.total ?? total);
    const numeroPedido = result?.numero_pedido ?? null;

    setCart([]);
    setNotes("");
    setMesaCodigo("");
    setHasActiveInStoreOrder(orderType === "in_store");
    setSuccess({
      message: `Pedido enviado. Total: ${currency(orderTotal, menu.settings?.currency ?? "DOP")}`,
      numeroPedido,
    });
    setShowCartPanel(false);
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center">
        Cargando menú...
      </div>
    );
  }

  if (!menu.settings) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-200/70">Menú no disponible</p>
          <h1 className="mt-3 text-3xl font-black">Este enlace no está activo.</h1>
          <p className="mt-3 text-sm text-orange-100/70">
            Verificá el código QR o pedí un enlace actualizado al restaurante.
          </p>
        </div>
      </div>
    );
  }

  const settings = menu.settings;

  // ── Order type selection screen ─────────────────────────────────────────
  if (orderType === null) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-8">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="mx-auto size-20 rounded-2xl object-contain bg-white/10 p-2 mb-4" />
            ) : (
              <div className="mx-auto size-20 rounded-2xl bg-orange-300/20 mb-4" />
            )}
            <h1 className="text-2xl font-black">{settings.title}</h1>
            <p className="mt-1 text-sm text-orange-100/60">¿Desde dónde estás pidiendo?</p>
          </div>

          <button
            onClick={() => setOrderType("in_store")}
            className="w-full rounded-[24px] border border-white/10 bg-white/[0.08] p-5 text-left cursor-pointer hover:bg-white/[0.14] transition"
          >
            <p className="text-lg font-black">🪑 Estoy en el local</p>
            <p className="text-sm text-orange-100/60 mt-1">Seleccioná tu mesa y pedí con código.</p>
          </button>

          <button
            onClick={() => setOrderType("takeout")}
            className="w-full rounded-[24px] border border-white/10 bg-white/[0.08] p-5 text-left cursor-pointer hover:bg-white/[0.14] transition"
          >
            <p className="text-lg font-black">🛍 Pido para llevar / afuera</p>
            <p className="text-sm text-orange-100/60 mt-1">Sin mesa. Pedido para retirar o a domicilio.</p>
          </button>
        </div>
      </div>
    );
  }

  // ── In-store: table selection screen ────────────────────────────────────
  if (orderType === "in_store" && selectedMesa === null) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] p-6">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => setOrderType(null)}
            className="mb-6 text-xs text-orange-200/60 hover:text-orange-200 transition cursor-pointer"
          >
            ← Volver
          </button>
          <h1 className="text-2xl font-black mb-2">Seleccioná tu mesa</h1>
          <p className="text-sm text-orange-100/60 mb-6">
            El restaurante tiene {menu.cantidad_mesas} mesas. Tocá la tuya.
          </p>

          {tableNumbers.length === 0 ? (
            <p className="text-sm text-orange-100/60">
              No hay mesas configuradas. Pedí asistencia al personal.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {tableNumbers.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedMesa(n)}
                  className="aspect-square rounded-2xl border border-white/10 bg-white/[0.07] text-xl font-black cursor-pointer hover:bg-orange-500/20 hover:border-orange-300/40 transition"
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── In-store: code validation screen ────────────────────────────────────
  if (orderType === "in_store" && selectedMesa !== null && mesaCodigo.length < 4) {
    // Show code entry only until the user hasn't entered 4 digits yet
    // (we keep this as a lightweight inline panel rather than a separate screen)
  }

  // ── Active in-store order blocker ────────────────────────────────────────
  if (orderType === "in_store" && hasActiveInStoreOrder) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="max-w-md rounded-[28px] border border-orange-300/20 bg-orange-500/10 p-8">
          <p className="text-4xl mb-4">⏳</p>
          <h1 className="text-2xl font-black">Tu pedido está en camino</h1>
          <p className="mt-3 text-sm text-orange-100/70">
            Ya tenés un pedido activo en la Mesa {selectedMesa}. Cuando esté listo,
            el personal te lo notificará.
          </p>
          <p className="mt-4 text-sm text-orange-200/60">
            Si necesitás agregar algo, solicitá asistencia al camarero.
          </p>
          <button
            onClick={() => {
              // Allow user to manually reset and try again (for new customer after same session)
              localStorage.removeItem(`cb_session_${slug}`);
              setHasActiveInStoreOrder(false);
              setSuccess(null);
            }}
            className="mt-6 text-xs text-orange-200/50 hover:text-orange-200 underline cursor-pointer"
          >
            Soy un cliente diferente en esta mesa
          </button>
        </div>
      </div>
    );
  }

  // ── Main menu view ───────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-[#15100c] text-[#fff7ed]">
      {/* Header */}
      <header className="relative overflow-hidden px-4 py-8 sm:px-8">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, #ff906d 0, transparent 28%), radial-gradient(circle at 90% 5%, #facc15 0, transparent 22%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl rounded-[36px] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="size-16 rounded-2xl object-contain bg-white/10 p-2"
                />
              ) : (
                <div className="size-16 rounded-2xl bg-orange-300/20" />
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-orange-200/75">Menú digital</p>
                <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{settings.title}</h1>
              </div>
            </div>
            <div className="text-sm text-orange-100/75 sm:text-right">
              {settings.address && <p>{settings.address}</p>}
              {settings.phone && <p>{settings.phone}</p>}
            </div>
          </div>
          {settings.description && (
            <p className="mt-5 max-w-2xl text-sm leading-6 text-orange-50/80">{settings.description}</p>
          )}

          {/* Context badge */}
          <div className="mt-4 flex flex-wrap gap-2">
            {orderType === "in_store" && selectedMesa && (
              <span className="rounded-xl bg-orange-500/20 border border-orange-300/20 px-3 py-1 text-xs font-bold text-orange-200">
                🪑 Mesa {selectedMesa}
              </span>
            )}
            {orderType === "takeout" && (
              <span className="rounded-xl bg-white/10 px-3 py-1 text-xs font-bold text-orange-200">
                🛍 Para llevar
              </span>
            )}
            <button
              onClick={() => { setOrderType(null); setSelectedMesa(null); setMesaCodigo(""); }}
              className="rounded-xl border border-white/10 px-3 py-1 text-xs text-orange-100/50 hover:text-orange-200 cursor-pointer transition"
            >
              Cambiar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 lg:grid-cols-[1fr_360px] lg:px-8">
        {/* Menu items */}
        <section className="space-y-8">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar platos, categorías o ingredientes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 pl-12 text-sm outline-none transition focus:border-orange-300/50 focus:bg-white/10 placeholder:text-orange-50/40"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-50/40 size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-50/40 hover:text-orange-200 transition cursor-pointer"
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {groupedItems.length === 0 && searchQuery ? (
            <div className="text-center py-10">
              <p className="text-orange-50/60">No se encontraron resultados para "{searchQuery}".</p>
            </div>
          ) : (
            groupedItems.map(([category, items]) => (
              <div key={category}>
                <h2 className="mb-4 text-xl font-black uppercase tracking-[0.16em] text-orange-200">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {items.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-xl"
                    >
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt=""
                          className="mb-4 h-36 w-full rounded-[20px] object-contain bg-black/10"
                        />
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black">{item.name}</h3>
                          {item.description && (
                            <p className="mt-1 text-sm leading-5 text-orange-50/65">{item.description}</p>
                          )}
                        </div>
                        <strong className="whitespace-nowrap text-orange-200">
                          {currency(item.price, settings.currency)}
                        </strong>
                      </div>
                      <button
                        onClick={() => addItem(item)}
                        className="mt-4 w-full rounded-2xl border-0 bg-[#ff906d] px-4 py-3 text-sm font-black uppercase tracking-widest text-[#24120b] shadow-lg cursor-pointer"
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

        {/* Cart / order panel */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[32px] border border-white/10 bg-[#21150f] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Tu pedido</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{itemCount} items</span>
            </div>

            <div className="mt-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-sm text-orange-50/60">Agregá productos para enviar tu pedido.</p>
              ) : (
                cart.map((line) => (
                  <div key={line.plato_id} className="rounded-2xl bg-white/[0.06] p-3">
                    <div className="flex justify-between gap-3 text-sm font-bold">
                      <span>{line.name}</span>
                      <span>{currency(line.price * line.quantity, settings.currency)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(line.plato_id, line.quantity - 1)}
                        className="size-8 rounded-full border border-white/10 bg-transparent text-white cursor-pointer"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-bold">{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(line.plato_id, line.quantity + 1)}
                        className="size-8 rounded-full border border-white/10 bg-transparent text-white cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex justify-between text-lg font-black">
                <span>Total</span>
                <span>{currency(total, settings.currency)}</span>
              </div>
            </div>

            {/* In-store: table code entry */}
            {orderType === "in_store" && selectedMesa !== null && (
              <div className="mt-4 rounded-2xl bg-orange-500/10 border border-orange-300/20 p-3">
                <p className="text-xs font-bold text-orange-200 mb-2">
                  Mesa {selectedMesa} — Ingresá el código de 4 dígitos
                </p>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  value={mesaCodigo}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setMesaCodigo(val);
                    setMesaCodeError(null);
                  }}
                  placeholder="0000"
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-center text-2xl font-black tracking-[0.5em] outline-none"
                />
                {mesaCodeError && (
                  <p className="mt-2 text-xs text-red-300">{mesaCodeError}</p>
                )}
              </div>
            )}

            <div className="mt-5 space-y-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre"
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Teléfono"
                type="tel"
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas del pedido"
                className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none"
              />
              {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
              {success && (
                <div className="rounded-xl bg-emerald-500/15 p-3">
                  <p className="text-sm text-emerald-100">{success.message}</p>
                  {success.numeroPedido !== null && (
                    <p className="mt-1 text-xs text-emerald-200/80">
                      Pedido #{success.numeroPedido}
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={() => void placeOrder()}
                disabled={placing || cart.length === 0}
                className="w-full rounded-2xl border-0 bg-orange-200 px-4 py-4 text-sm font-black uppercase tracking-widest text-[#21150f] disabled:opacity-50 cursor-pointer"
              >
                {placing ? "Enviando..." : "Enviar pedido"}
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile floating cart button */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 lg:hidden z-50">
          <button
            onClick={() => setShowCartPanel(!showCartPanel)}
            className="flex items-center gap-3 rounded-full bg-[#ff906d] px-6 py-4 font-black text-[#24120b] shadow-2xl cursor-pointer"
          >
            <span>🛒 {itemCount} items</span>
            <span>{currency(total, settings.currency)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
