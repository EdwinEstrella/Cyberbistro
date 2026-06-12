import { useCallback, useEffect, useMemo, useState } from "react";
import { useSucursal } from "../../app/context/SucursalContext";
import { useAuth, ensureAuthSessionFresh } from "../../shared/hooks/useAuth";
import { insforgeClient } from "../../shared/lib/insforge";

type MenuSettings = {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  enabled: boolean;
  public_slug: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
};

type Plato = {
  id: number;
  tenant_id: string;
  sucursal_id?: string | null;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
};

type MenuItem = {
  id: string;
  tenant_id: string;
  plato_id: number;
  display_name: string | null;
  description: string | null;
  image_url: string | null;
  visible: boolean;
  sort_order: number;
};

type DigitalOrder = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  status: "pending" | "accepted" | "rejected" | string;
  total: number;
  created_at: string;
};

type DigitalOrderItem = {
  id: string;
  order_id: string;
  name_snapshot: string;
  quantity: number;
  subtotal: number;
};

type EditableItem = MenuItem & { plato: Plato };

const currency = (value: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(value || 0);

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `menu-${crypto.randomUUID().slice(0, 8)}`;
}

function buildMenuUrl(slug: string) {
  const origin = window.location.origin === "file://" ? "https://claudix-app.azokia.com" : window.location.origin;
  return `${origin}/#/menu/${encodeURIComponent(slug)}`;
}

function tenantScopedDefaultSlug(name: string | null | undefined, tenantId: string) {
  return slugify(`${name || "menu"}-${tenantId.slice(0, 8)}`);
}

export function Pedidos() {
  const { tenantId, loading: authLoading } = useAuth();
  const { activeSucursalId, sucursales } = useSucursal();
  const [settings, setSettings] = useState<MenuSettings | null>(null);
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<DigitalOrder[]>([]);
  const [orderItems, setOrderItems] = useState<DigitalOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeSucursal = sucursales.find((s) => s.id === activeSucursalId);
  const menuUrl = settings ? buildMenuUrl(settings.public_slug) : "";

  const editableItems = useMemo(() => {
    const byPlato = new Map(menuItems.map((item) => [item.plato_id, item]));
    return platos.map((plato, index): EditableItem => ({
      id: byPlato.get(plato.id)?.id ?? `local-${plato.id}`,
      tenant_id: tenantId ?? "",
      plato_id: plato.id,
      display_name: byPlato.get(plato.id)?.display_name ?? plato.nombre,
      description: byPlato.get(plato.id)?.description ?? null,
      image_url: byPlato.get(plato.id)?.image_url ?? null,
      visible: byPlato.get(plato.id)?.visible ?? false,
      sort_order: byPlato.get(plato.id)?.sort_order ?? index,
      plato,
    }));
  }, [menuItems, platos, tenantId]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    await ensureAuthSessionFresh();

    const settingsQuery = insforgeClient.database
      .from("digital_menu_settings")
      .select("id, tenant_id, sucursal_id, enabled, public_slug, title, description, logo_url, banner_url")
      .eq("tenant_id", tenantId);

    const [settingsRes, platosRes, itemsRes, ordersRes] = await Promise.all([
      activeSucursalId
        ? settingsQuery.eq("sucursal_id", activeSucursalId).maybeSingle()
        : settingsQuery.is("sucursal_id", null).maybeSingle(),
      insforgeClient.database.from("platos").select("id, tenant_id, sucursal_id, nombre, precio, categoria, disponible").eq("tenant_id", tenantId).order("categoria", { ascending: true }).order("nombre", { ascending: true }),
      insforgeClient.database.from("digital_menu_items").select("id, tenant_id, plato_id, display_name, description, image_url, visible, sort_order").eq("tenant_id", tenantId).order("sort_order", { ascending: true }),
      insforgeClient.database.from("digital_orders").select("id, customer_name, customer_phone, notes, status, total, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(30),
    ]);

    if (settingsRes.error) console.error(settingsRes.error.message);
    if (platosRes.error) console.error(platosRes.error.message);
    if (itemsRes.error) console.error(itemsRes.error.message);
    if (ordersRes.error) console.error(ordersRes.error.message);

    const loadedOrders = (ordersRes.data ?? []) as DigitalOrder[];
    const orderIds = loadedOrders.map((order) => order.id);
    let loadedOrderItems: DigitalOrderItem[] = [];
    if (orderIds.length > 0) {
      const orderItemsRes = await insforgeClient.database.from("digital_order_items").select("id, order_id, name_snapshot, quantity, subtotal").in("order_id", orderIds);
      if (orderItemsRes.error) console.error(orderItemsRes.error.message);
      loadedOrderItems = (orderItemsRes.data ?? []) as DigitalOrderItem[];
    }

    setSettings((settingsRes.data as MenuSettings | null) ?? null);
    setPlatos(((platosRes.data ?? []) as Plato[]).filter((plato) => !activeSucursalId || !plato.sucursal_id || plato.sucursal_id === activeSucursalId));
    setMenuItems((itemsRes.data ?? []) as MenuItem[]);
    setOrders(loadedOrders);
    setOrderItems(loadedOrderItems);
    setLoading(false);
  }, [activeSucursalId, tenantId]);

  useEffect(() => {
    if (!authLoading && tenantId) void loadData();
    if (!authLoading && !tenantId) setLoading(false);
  }, [authLoading, loadData, tenantId]);

  async function saveSettings(patch: Partial<MenuSettings>) {
    if (!tenantId) return;
    setSaving(true);
    const nextSlug = patch.public_slug ? slugify(patch.public_slug) : settings?.public_slug;
    const payload = {
      tenant_id: tenantId,
      sucursal_id: activeSucursalId,
      enabled: patch.enabled ?? settings?.enabled ?? false,
      public_slug: nextSlug ?? tenantScopedDefaultSlug(activeSucursal?.nombre, tenantId),
      title: patch.title ?? settings?.title ?? activeSucursal?.nombre ?? "Menú digital",
      description: patch.description ?? settings?.description ?? null,
      logo_url: patch.logo_url ?? settings?.logo_url ?? null,
      banner_url: patch.banner_url ?? settings?.banner_url ?? null,
      updated_at: new Date().toISOString(),
    };
    const result = settings
      ? await insforgeClient.database.from("digital_menu_settings").update(payload).eq("id", settings.id).select().maybeSingle()
      : await insforgeClient.database.from("digital_menu_settings").insert([{ ...payload, created_at: new Date().toISOString() }]).select().maybeSingle();

    if (result.error) {
      setMessage(result.error.message || "No se pudo guardar la configuración.");
    } else {
      const saved = result.data as MenuSettings;
      setSettings(saved);
      await insforgeClient.database.from("tenants").update({ menu_url: saved.enabled ? buildMenuUrl(saved.public_slug) : null, updated_at: new Date().toISOString() }).eq("id", tenantId);
      setMessage("Menú actualizado.");
    }
    setSaving(false);
  }

  async function upsertItem(item: EditableItem, patch: Partial<MenuItem>) {
    if (!tenantId) return;
    const exists = !item.id.startsWith("local-");
    const payload = {
      tenant_id: tenantId,
      plato_id: item.plato_id,
      display_name: patch.display_name ?? item.display_name,
      description: patch.description ?? item.description,
      image_url: patch.image_url ?? item.image_url,
      visible: patch.visible ?? item.visible,
      sort_order: patch.sort_order ?? item.sort_order,
      updated_at: new Date().toISOString(),
    };
    const result = exists
      ? await insforgeClient.database.from("digital_menu_items").update(payload).eq("id", item.id).select().maybeSingle()
      : await insforgeClient.database.from("digital_menu_items").insert([{ ...payload, created_at: new Date().toISOString() }]).select().maybeSingle();
    if (result.error) {
      setMessage(result.error.message || "No se pudo actualizar el producto.");
      return;
    }
    const saved = result.data as MenuItem;
    setMenuItems((current) => exists ? current.map((row) => row.id === saved.id ? saved : row) : [...current, saved]);
  }

  async function updateOrderStatus(order: DigitalOrder, status: "accepted" | "rejected") {
    const patch = status === "accepted"
      ? { status, accepted_at: new Date().toISOString(), rejection_reason: null }
      : { status, rejected_at: new Date().toISOString(), rejection_reason: "Rechazado desde pedidos" };
    const { error } = await insforgeClient.database.from("digital_orders").update(patch).eq("id", order.id);
    if (error) {
      setMessage(error.message || "No se pudo actualizar el pedido.");
      return;
    }
    setOrders((current) => current.map((row) => row.id === order.id ? { ...row, status } : row));
  }

  async function copyMenuLink() {
    if (!menuUrl) return;
    await navigator.clipboard?.writeText(menuUrl);
    setMessage("Enlace copiado.");
  }

  if (authLoading || loading) return <div className="p-8 text-muted-foreground">Cargando pedidos...</div>;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="rounded-[28px] border border-black/10 bg-card p-6 shadow-sm dark:border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Menú digital</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-['Space_Grotesk'] text-3xl font-black text-foreground">Pedidos y menú público</h1>
              <p className="mt-2 text-sm text-muted-foreground">Configurá el QR del restaurante y respondé pedidos entrantes.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void copyMenuLink()} disabled={!menuUrl} className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-bold uppercase tracking-widest text-foreground disabled:opacity-40 cursor-pointer">Copiar link</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Menú digital: ${menuUrl}`)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white no-underline">WhatsApp</a>
            </div>
          </div>
          {message && <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">{message}</p>}
        </header>

        <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="rounded-[24px] border border-black/10 bg-card p-5 dark:border-white/10">
            <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Configuración pública</h2>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                <input type="checkbox" checked={settings?.enabled ?? false} onChange={(e) => void saveSettings({ enabled: e.target.checked })} className="size-4 accent-primary" />
                Menú activo
              </label>
              <Field label="Slug público"><input className="input-field" value={settings?.public_slug ?? ""} onChange={(e) => setSettings((current) => current ? { ...current, public_slug: e.target.value } : current)} onBlur={(e) => void saveSettings({ public_slug: e.target.value })} placeholder="mi-restaurante" /></Field>
              <Field label="Título"><input className="input-field" value={settings?.title ?? ""} onChange={(e) => setSettings((current) => current ? { ...current, title: e.target.value } : current)} onBlur={(e) => void saveSettings({ title: e.target.value })} placeholder="Nombre del menú" /></Field>
              <Field label="Descripción"><textarea className="input-field min-h-20" value={settings?.description ?? ""} onChange={(e) => setSettings((current) => current ? { ...current, description: e.target.value } : current)} onBlur={(e) => void saveSettings({ description: e.target.value })} /></Field>
              {!settings && <button onClick={() => void saveSettings({ enabled: true })} disabled={saving} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground border-0 cursor-pointer">Crear menú</button>}
              {menuUrl && <p className="break-all rounded-xl bg-muted p-3 text-xs text-muted-foreground">{menuUrl}</p>}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-card p-5 dark:border-white/10">
            <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Productos visibles</h2>
            <div className="mt-4 grid gap-3">
              {editableItems.map((item) => (
                <div key={item.plato_id} className="grid gap-3 rounded-2xl border border-border bg-background/60 p-4 md:grid-cols-[1fr_120px_90px] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-foreground">{item.plato.nombre}</strong>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{item.plato.categoria}</span>
                      {!item.plato.disponible && <span className="text-xs text-red-500">No disponible</span>}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input className="input-field" value={item.display_name ?? ""} onChange={(e) => void upsertItem(item, { display_name: e.target.value })} placeholder="Nombre público" />
                      <input className="input-field" value={item.description ?? ""} onChange={(e) => void upsertItem(item, { description: e.target.value })} placeholder="Descripción" />
                      <input className="input-field sm:col-span-2" value={item.image_url ?? ""} onChange={(e) => void upsertItem(item, { image_url: e.target.value })} placeholder="URL de imagen" />
                    </div>
                  </div>
                  <input type="number" className="input-field" value={item.sort_order} onChange={(e) => void upsertItem(item, { sort_order: Number(e.target.value) || 0 })} />
                  <label className="flex items-center justify-end gap-2 text-sm font-bold text-foreground">
                    Visible
                    <input type="checkbox" checked={item.visible} onChange={(e) => void upsertItem(item, { visible: e.target.checked })} className="size-4 accent-primary" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-black/10 bg-card p-5 dark:border-white/10">
          <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Pedidos entrantes</h2>
          <div className="mt-4 grid gap-3">
            {orders.length === 0 ? <p className="text-sm text-muted-foreground">Sin pedidos todavía.</p> : orders.map((order) => {
              const lines = orderItems.filter((item) => item.order_id === order.id);
              return (
                <article key={order.id} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-lg text-foreground">{order.customer_name}</strong>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{order.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()} {order.customer_phone ? `• ${order.customer_phone}` : ""}</p>
                      {order.notes && <p className="mt-2 text-sm text-foreground">Nota: {order.notes}</p>}
                      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                        {lines.map((line) => <li key={line.id}>{line.quantity}× {line.name_snapshot} — {currency(line.subtotal)}</li>)}
                      </ul>
                    </div>
                    <div className="flex flex-col gap-2 md:items-end">
                      <strong className="text-xl text-foreground">{currency(order.total)}</strong>
                      {order.status === "pending" && <div className="flex gap-2"><button onClick={() => void updateOrderStatus(order, "accepted")} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase text-white border-0 cursor-pointer">Aceptar</button><button onClick={() => void updateOrderStatus(order, "rejected")} className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold uppercase text-white border-0 cursor-pointer">Rechazar</button></div>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <style>{`.input-field{width:100%;background-color:var(--muted);border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--foreground);outline:none}.input-field:focus{border-color:var(--primary);background-color:transparent}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>{children}</div>;
}
