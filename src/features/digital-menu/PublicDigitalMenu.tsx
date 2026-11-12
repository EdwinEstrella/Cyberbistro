import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { supabase } from "../../shared/lib/supabase";
import { ClosedRestaurantState } from "./components/ClosedRestaurantState";
import { PublicMenuHome } from "./components/public-home/PublicMenuHome";
import {
  PublicMenuOrderScreen,
  type CartLine,
  type PublicMenuItem,
} from "./components/PublicMenuOrderScreen";
import { isRestaurantClosedError, RESTAURANT_CLOSED_MESSAGE } from "./lib/onlineStatus";
import {
  asMenuPayload,
  buildCreateOrderRpcArgs,
  formatCurrency,
  getClientSessionId,
  type PublicMenuPayload,
} from "./lib/publicMenuPayload";
import { resolvePublicMenuMode } from "./lib/publicMenuMode";
import { useOnlineMenuStatus } from "./lib/useOnlineMenuStatus";
import { publicMenuTheme } from "./components/public-app/publicMenuTheme";

export { asMenuPayload, buildCreateOrderRpcArgs, formatCurrency, getClientSessionId };
export type { PublicMenuPayload };

export function PublicDigitalMenu() {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();

  const [menu, setMenu] = useState<PublicMenuPayload>({
    settings: null,
    items: [],
    cantidad_mesas: 0,
    contact: {},
  });
  const [cart, setCart] = useState<CartLine[]>([]);

  // Navigation screen
  const [screen, setScreen] = useState<"home" | "order">("home");

  // Party size selection (table mode)
  const [partySize, setPartySize] = useState<number | null>(null);

  // Table security code
  const [mesaCodigo, setMesaCodigo] = useState("");
  const [mesaCodeError, setMesaCodeError] = useState<string | null>(null);

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
  const [success, setSuccess] = useState<{ message: string; numeroPedido: number | null } | null>(
    null
  );

  // Mode resolution (table vs takeout)
  const mode = useMemo(
    () =>
      resolvePublicMenuMode({
        mesaParam: searchParams.get("mesa"),
        cantidadMesas: menu.cantidad_mesas,
      }),
    [searchParams, menu.cantidad_mesas]
  );

  // Stable session ID
  const clientSessionId = useMemo(() => (slug ? getClientSessionId(slug) : ""), [slug]);

  // Online cycle status
  const { isOpen, setIsOpen, checking: isCheckingStatus, checkStatus } = useOnlineMenuStatus({
    slug,
  });

  // Load menu from RPC
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const [{ data, error: rpcError }] = await Promise.all([
        supabase.rpc("get_public_digital_menu", { p_public_slug: slug }),
        checkStatus(),
      ]);
      if (!active) return;
      if (rpcError) {
        setError(rpcError.message || "No se pudo cargar el menú.");
        setLoading(false);
        return;
      }
      setMenu(asMenuPayload(data));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [slug, checkStatus]);

  // Realtime: refresh menu on changes
  useEffect(() => {
    if (!menu.settings?.tenant_id) return;
    const channelName = `digital_menu:${menu.settings.tenant_id}`;
    let active = true;

    const channel = supabase.channel(channelName);

    const handleMenuChanged = (msg: unknown) => {
      if (!active) return;
      const m = msg as { meta?: { channel?: string } } | null;
      if (m?.meta?.channel && !m.meta.channel.includes(channelName)) return;
      void supabase
        .rpc("get_public_digital_menu", { p_public_slug: slug })
        .then(({ data, error: rpcError }) => {
          if (!rpcError && active) setMenu(asMenuPayload(data));
        });
    };

    channel
      .on("broadcast", { event: "menu_changed" }, handleMenuChanged)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Realtime subscription failed:", status);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [menu.settings?.tenant_id, slug]);

  // Check if this browser session already has an active in-store order
  useEffect(() => {
    if (!menu.settings?.tenant_id || !clientSessionId || mode.kind !== "table") return;

    void supabase
      .from("digital_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", menu.settings.tenant_id)
      .eq("client_session_id", clientSessionId)
      .eq("status", "pending")
      .then(({ count }) => {
        setHasActiveInStoreOrder((count ?? 0) > 0);
      });
  }, [menu.settings?.tenant_id, clientSessionId, mode.kind, success]);

  // Cart actions
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

  function clearCart() {
    setCart([]);
  }

  // Place order
  async function placeOrder() {
    if (!customerName.trim()) {
      setError("Indicá tu nombre para confirmar el pedido.");
      return;
    }
    if (cart.length === 0) {
      setError("Agregá al menos un producto al carrito.");
      return;
    }
    if (mode.kind === "table") {
      if (mesaCodigo.trim().length !== 4 || !/^\d{4}$/.test(mesaCodigo.trim())) {
        setError("El código de mesa debe ser de 4 dígitos.");
        return;
      }
    }

    setPlacing(true);
    setError(null);
    setMesaCodeError(null);

    const rpcArgs = buildCreateOrderRpcArgs({
      slug,
      customerName,
      customerPhone,
      notes,
      cart,
      mode,
      partySize,
      mesaCodigo,
      clientSessionId,
    });

    const { data, error: rpcError } = await supabase.rpc(
      "create_public_digital_order",
      rpcArgs as Parameters<typeof supabase.rpc>[1]
    );

    setPlacing(false);

    if (rpcError) {
      const msg = rpcError.message || "No se pudo enviar el pedido.";
      if (isRestaurantClosedError(msg)) {
        setIsOpen(false);
        setError(RESTAURANT_CLOSED_MESSAGE);
        return;
      }
      if (msg.toLowerCase().includes("código de mesa incorrecto")) {
        setMesaCodeError("Código incorrecto. Verificá el código en la mesa.");
      } else {
        setError(msg);
      }
      return;
    }

    const result = data as { order_id?: string; total?: number; numero_pedido?: number } | null;
    const currentTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderTotal = Number(result?.total ?? currentTotal);
    const numeroPedido = result?.numero_pedido ?? null;

    setCart([]);
    setNotes("");
    setMesaCodigo("");
    setHasActiveInStoreOrder(mode.kind === "table");
    setSuccess({
      message: `Pedido enviado. Total: ${formatCurrency(orderTotal, menu.settings?.currency ?? "DOP")}`,
      numeroPedido,
    });
  }

  // ── Render States ──────────────────────────────────────────────────────────

  if (isOpen === false) {
    return (
      <ClosedRestaurantState
        title={menu.settings?.title}
        logoUrl={menu.settings?.logo_url}
        onRetry={() => {
          void checkStatus().then((open) => {
            if (open) {
              void supabase
                .rpc("get_public_digital_menu", { p_public_slug: slug })
                .then(({ data, error: rpcErr }) => {
                  if (!rpcErr) setMenu(asMenuPayload(data));
                });
            }
          });
        }}
        isRetrying={isCheckingStatus}
      />
    );
  }

  if (loading) {
    return (
      <div className={publicMenuTheme.canvas} style={publicMenuTheme.rootStyle}>
        <div
          className={`${publicMenuTheme.deviceColumn} items-center justify-center p-6 text-center text-zinc-400`}
          style={publicMenuTheme.rootStyle}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <p className="text-xs font-semibold text-zinc-400">Cargando menú...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!menu.settings) {
    return (
      <div className={publicMenuTheme.canvas} style={publicMenuTheme.rootStyle}>
        <div
          className={`${publicMenuTheme.deviceColumn} items-center justify-center p-6 text-center`}
          style={publicMenuTheme.rootStyle}
        >
          <div className="w-full rounded-2xl border border-[#27272a] bg-[#111113] p-7 shadow-2xl">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
              Menú no disponible
            </p>
            <h1 className="mt-2 text-xl font-bold text-white">Este enlace no está activo.</h1>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Verificá el código QR o pedí un enlace actualizado al restaurante.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active in-store order blocker
  if (mode.kind === "table" && hasActiveInStoreOrder) {
    return (
      <div className={publicMenuTheme.canvas} style={publicMenuTheme.rootStyle}>
        <div
          className={`${publicMenuTheme.deviceColumn} items-center justify-center p-6 text-center`}
          style={publicMenuTheme.rootStyle}
        >
          <div className="w-full rounded-2xl border border-[#27272a] bg-[#111113] p-7 shadow-2xl">
            <div className="mx-auto size-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center text-2xl mb-4">
              ⏳
            </div>
            <h1 className="text-xl font-bold text-white">Tu pedido está en camino</h1>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Ya tenés un pedido activo en la Mesa {mode.mesa}. Cuando esté listo, el personal te lo
              notificará.
            </p>
            <p className="mt-3 text-[11px] text-zinc-500">
              Si necesitás agregar algo, solicitá asistencia al camarero.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof localStorage !== "undefined") {
                  localStorage.removeItem(`cb_session_${slug}`);
                }
                setHasActiveInStoreOrder(false);
                setSuccess(null);
              }}
              className="mt-6 text-xs text-zinc-400 hover:text-white underline cursor-pointer"
            >
              Soy un cliente diferente en esta mesa
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Home Screen
  if (screen === "home") {
    return (
      <PublicMenuHome
        mode={mode}
        settings={menu.settings}
        contact={menu.contact}
        partySize={partySize}
        onPartySizeChange={setPartySize}
        onViewMenu={() => setScreen("order")}
      />
    );
  }

  // Menu + Order Screen
  return (
    <PublicMenuOrderScreen
      settings={menu.settings}
      mode={mode}
      partySize={partySize}
      items={menu.items}
      cart={cart}
      onAddItem={addItem}
      onUpdateQuantity={updateQuantity}
      onClearCart={clearCart}
      customerName={customerName}
      onCustomerNameChange={setCustomerName}
      customerPhone={customerPhone}
      onCustomerPhoneChange={setCustomerPhone}
      notes={notes}
      onNotesChange={setNotes}
      mesaCodigo={mesaCodigo}
      onMesaCodigoChange={setMesaCodigo}
      mesaCodeError={mesaCodeError}
      error={error}
      success={success}
      placing={placing}
      onPlaceOrder={() => void placeOrder()}
      onBackToHome={() => setScreen("home")}
      onDismissSuccess={() => setSuccess(null)}
      contact={menu.contact}
      currencyFormatter={formatCurrency}
    />
  );
}
