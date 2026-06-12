import { useCallback, useEffect, useState } from "react";
import { useSucursal } from "../../app/context/SucursalContext";
import { useAuth, ensureAuthSessionFresh } from "../../shared/hooks/useAuth";
import { insforgeClient } from "../../shared/lib/insforge";

type MenuSettings = {
  id: string;
  tenant_id: string;
  public_slug: string;
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

const currency = (value: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(value || 0);

function buildMenuUrl(slug: string) {
  return `https://claudix-app.azokia.com/#/menu/${encodeURIComponent(slug)}`;
}

export function Pedidos() {
  const { tenantId, loading: authLoading } = useAuth();
  const { activeSucursalId } = useSucursal();
  const [settings, setSettings] = useState<MenuSettings | null>(null);
  const [orders, setOrders] = useState<DigitalOrder[]>([]);
  const [orderItems, setOrderItems] = useState<DigitalOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const menuUrl = settings ? buildMenuUrl(settings.public_slug) : "";

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    await ensureAuthSessionFresh();

    const settingsQuery = insforgeClient.database
      .from("digital_menu_settings")
      .select("id, tenant_id, public_slug")
      .eq("tenant_id", tenantId);

    const [settingsRes, ordersRes] = await Promise.all([
      activeSucursalId
        ? settingsQuery.eq("sucursal_id", activeSucursalId).maybeSingle()
        : settingsQuery.is("sucursal_id", null).maybeSingle(),
      insforgeClient.database.from("digital_orders").select("id, customer_name, customer_phone, notes, status, total, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(30),
    ]);

    if (settingsRes.error) console.error(settingsRes.error.message);
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
    setOrders(loadedOrders);
    setOrderItems(loadedOrderItems);
    setLoading(false);
  }, [activeSucursalId, tenantId]);

  useEffect(() => {
    if (!authLoading && tenantId) void loadData();
    if (!authLoading && !tenantId) setLoading(false);
  }, [authLoading, loadData, tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    const channelName = `cocina:${tenantId}`;
    let active = true;

    const setupRealtime = async () => {
      await insforgeClient.realtime.connect();
      const sub = await insforgeClient.realtime.subscribe(channelName);
      if (!sub.ok) { console.error("Realtime sub error in Pedidos:", sub.error); return; }
    };

    const handleDigitalOrderChanged = (msg: any) => {
      if (!active) return;
      if (msg?.meta?.channel && !msg.meta.channel.includes(channelName)) return;
      void loadData();
    };

    insforgeClient.realtime.on("INSERT_digital_order", handleDigitalOrderChanged);
    insforgeClient.realtime.on("UPDATE_digital_order", handleDigitalOrderChanged);
    insforgeClient.realtime.on("DELETE_digital_order", handleDigitalOrderChanged);
    
    void setupRealtime();

    return () => {
      active = false;
      insforgeClient.realtime.off("INSERT_digital_order", handleDigitalOrderChanged);
      insforgeClient.realtime.off("UPDATE_digital_order", handleDigitalOrderChanged);
      insforgeClient.realtime.off("DELETE_digital_order", handleDigitalOrderChanged);
      insforgeClient.realtime.unsubscribe(channelName);
    };
  }, [tenantId, loadData]);



  async function updateOrderStatus(order: DigitalOrder, status: "accepted" | "rejected") {
    const patch = status === "accepted"
      ? { status, accepted_at: new Date().toISOString(), rejection_reason: null }
      : { status, rejected_at: new Date().toISOString(), rejection_reason: "Rechazado desde pedidos" };

    if (status === "accepted") {
      const orderLines = orderItems.filter((item) => item.order_id === order.id);
      const comandaItems = orderLines.map((line) => ({
        nombre: line.name_snapshot,
        precio: line.quantity > 0 ? line.subtotal / line.quantity : 0,
        cantidad: line.quantity,
        notas: ""
      }));

      const comandaPayload = {
        tenant_id: tenantId,
        sucursal_id: activeSucursalId || null,
        estado: "pendiente",
        creado_por: "digital",
        notas: `[DIGITAL] ${order.customer_name}${order.notes ? ' - ' + order.notes : ''}`,
        items: comandaItems
      };

      const { error: comandaError } = await insforgeClient.database.from("comandas").insert(comandaPayload);
      if (comandaError) {
         setMessage(comandaError.message || "No se pudo crear la comanda para cocina.");
         return;
      }
    }

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
              <h1 className="font-['Space_Grotesk'] text-3xl font-black text-foreground">Pedidos entrantes</h1>
              <p className="mt-2 text-sm text-muted-foreground">Respondé pedidos entrantes desde el menú público.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void copyMenuLink()} disabled={!menuUrl} className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-bold uppercase tracking-widest text-foreground disabled:opacity-40 cursor-pointer">Copiar link</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Menú digital: ${menuUrl}`)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white no-underline">WhatsApp</a>
            </div>
          </div>
          {message && <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">{message}</p>}
        </header>

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


