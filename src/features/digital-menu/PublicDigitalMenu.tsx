import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { insforgeClient } from "../../shared/lib/insforge";

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
};

type CartLine = PublicMenuItem & { quantity: number; notes?: string };

const currency = (value: number, code: string) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: code === "ARS" ? "ARS" : "DOP" }).format(value || 0);

function asMenuPayload(value: unknown): PublicMenuPayload {
  const payload = value as Partial<PublicMenuPayload> | null;
  return {
    settings: payload?.settings ?? null,
    items: Array.isArray(payload?.items) ? payload.items : [],
  };
}

export function PublicDigitalMenu() {
  const { slug = "" } = useParams();
  const [menu, setMenu] = useState<PublicMenuPayload>({ settings: null, items: [] });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: rpcError } = await insforgeClient.database.rpc("get_public_digital_menu", {
        p_public_slug: slug,
      });
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

  useEffect(() => {
    if (!menu.settings?.tenant_id) return;
    
    const channelName = `digital_menu:${menu.settings.tenant_id}`;
    let active = true;

    const setupRealtime = async () => {
      await insforgeClient.realtime.connect();
      const sub = await insforgeClient.realtime.subscribe(channelName);
      if (!sub.ok) { console.error("Realtime sub error:", sub.error); return; }
      console.log("Realtime: successfully subscribed to", channelName);
    };

    const handleMenuChanged = (msg: any) => {
      console.log("Realtime event received:", msg);
      if (!active) return;
      if (msg?.meta?.channel && !msg.meta.channel.includes(channelName)) return; // filter to our channel
      
      console.log("Realtime: Refetching menu...");
      void insforgeClient.database.rpc("get_public_digital_menu", {
        p_public_slug: slug,
      }).then(({ data, error }) => {
        if (!error && active) {
          setMenu(asMenuPayload(data));
        } else {
          console.error("Realtime: error refetching menu", error);
        }
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

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PublicMenuItem[]>();
    for (const item of menu.items) {
      const key = item.category || "General";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [menu.items]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addItem(item: PublicMenuItem) {
    setSuccess(null);
    setCart((current) => {
      const existing = current.find((line) => line.plato_id === item.plato_id);
      if (existing) {
        return current.map((line) => line.plato_id === item.plato_id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function updateQuantity(platoId: number, quantity: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.plato_id !== platoId) return [line];
      if (quantity <= 0) return [];
      return [{ ...line, quantity }];
    }));
  }

  async function placeOrder() {
    if (!customerName.trim()) {
      setError("Indicá tu nombre para confirmar el pedido.");
      return;
    }
    if (cart.length === 0) {
      setError("Agregá al menos un producto al carrito.");
      return;
    }
    setPlacing(true);
    setError(null);
    const { data, error: rpcError } = await insforgeClient.database.rpc("create_public_digital_order", {
      p_public_slug: slug,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim() || null,
      p_notes: notes.trim() || null,
      p_items: cart.map((line) => ({ plato_id: line.plato_id, quantity: line.quantity, notes: line.notes ?? null })),
    });
    setPlacing(false);
    if (rpcError) {
      setError(rpcError.message || "No se pudo enviar el pedido.");
      return;
    }
    const result = data as { order_id?: string; total?: number } | null;
    setCart([]);
    setNotes("");
    setSuccess(`Pedido enviado. Total: ${currency(Number(result?.total ?? total), menu.settings?.currency ?? "DOP")}`);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center">Cargando menú...</div>;
  }

  if (!menu.settings) {
    return (
      <div className="min-h-screen bg-[#15100c] text-[#fff7ed] grid place-items-center p-6 text-center">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-200/70">Menú no disponible</p>
          <h1 className="mt-3 text-3xl font-black">Este enlace no está activo.</h1>
          <p className="mt-3 text-sm text-orange-100/70">Verifica el código QR o pide un enlace actualizado al restaurante.</p>
        </div>
      </div>
    );
  }

  const settings = menu.settings;

  return (
    <div className="min-h-screen bg-[#15100c] text-[#fff7ed]">
      <header className="relative overflow-hidden px-4 py-8 sm:px-8">
        <div className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(circle at 20% 10%, #ff906d 0, transparent 28%), radial-gradient(circle at 90% 5%, #facc15 0, transparent 22%)" }} />
        <div className="relative mx-auto max-w-6xl rounded-[36px] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="size-16 rounded-2xl object-contain bg-white/10 p-2" /> : <div className="size-16 rounded-2xl bg-orange-300/20" />}
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
          {settings.description && <p className="mt-5 max-w-2xl text-sm leading-6 text-orange-50/80">{settings.description}</p>}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 lg:grid-cols-[1fr_360px] lg:px-8">
        <section className="space-y-8">
          {groupedItems.map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-4 text-xl font-black uppercase tracking-[0.16em] text-orange-200">{category}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((item) => (
                  <article key={item.id} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
                    {item.image_url && <img src={item.image_url} alt="" className="mb-4 h-36 w-full rounded-[20px] object-cover" />}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-black">{item.name}</h3>
                        {item.description && <p className="mt-1 text-sm leading-5 text-orange-50/65">{item.description}</p>}
                      </div>
                      <strong className="whitespace-nowrap text-orange-200">{currency(item.price, settings.currency)}</strong>
                    </div>
                    <button onClick={() => addItem(item)} className="mt-4 w-full rounded-2xl border-0 bg-[#ff906d] px-4 py-3 text-sm font-black uppercase tracking-widest text-[#24120b] shadow-lg cursor-pointer">Agregar</button>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[32px] border border-white/10 bg-[#21150f] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Tu pedido</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{itemCount} items</span>
            </div>
            <div className="mt-4 space-y-3">
              {cart.length === 0 ? <p className="text-sm text-orange-50/60">Agregá productos para enviar tu pedido.</p> : cart.map((line) => (
                <div key={line.plato_id} className="rounded-2xl bg-white/[0.06] p-3">
                  <div className="flex justify-between gap-3 text-sm font-bold"><span>{line.name}</span><span>{currency(line.price * line.quantity, settings.currency)}</span></div>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => updateQuantity(line.plato_id, line.quantity - 1)} className="size-8 rounded-full border border-white/10 bg-transparent text-white cursor-pointer">−</button>
                    <span className="w-8 text-center font-bold">{line.quantity}</span>
                    <button onClick={() => updateQuantity(line.plato_id, line.quantity + 1)} className="size-8 rounded-full border border-white/10 bg-transparent text-white cursor-pointer">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex justify-between text-lg font-black"><span>Total</span><span>{currency(total, settings.currency)}</span></div>
            </div>
            <div className="mt-5 space-y-3">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre" className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none" />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas del pedido" className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none" />
              {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
              {success && <p className="rounded-xl bg-emerald-500/15 p-3 text-sm text-emerald-100">{success}</p>}
              <button onClick={placeOrder} disabled={placing || cart.length === 0} className="w-full rounded-2xl border-0 bg-orange-200 px-4 py-4 text-sm font-black uppercase tracking-widest text-[#21150f] disabled:opacity-50 cursor-pointer">{placing ? "Enviando..." : "Enviar pedido"}</button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}



