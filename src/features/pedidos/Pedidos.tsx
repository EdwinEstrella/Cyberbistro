import { useCallback, useEffect, useState } from "react";
import { useSucursal } from "../../app/context/SucursalContext";
import { useAuth, ensureAuthSessionFresh } from "../../shared/hooks/useAuth";
import { insforgeClient } from "../../shared/lib/insforge";
import { tenantRealtimeSubscriptionManager } from "../../shared/lib/tenantRealtimeSubscriptionManager";

// ── Types ─────────────────────────────────────────────────────────────────────

type MenuSettings = {
  id: string;
  tenant_id: string;
  public_slug: string;
};

type DigitalOrder = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  status: "pending" | "accepted" | "rejected" | string;
  total: number;
  created_at: string;
  order_type: "takeout" | "in_store" | string;
  mesa_numero: number | null;
  numero_pedido: number | null;
  sucursal_id: string | null;
};

type DigitalOrderItem = {
  id: string;
  order_id: string;
  plato_id: number | null;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const currency = (value: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(value || 0);

function buildMenuUrl(slug: string) {
  return `https://claudix-app.azokia.com/#/menu/${encodeURIComponent(slug)}`;
}

function orderTypeLabel(type: string | null | undefined): string {
  if (type === "in_store") return "Mesa";
  if (type === "takeout") return "Para llevar";
  return "Digital";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Pedidos() {
  const { tenantId, loading: authLoading, tenantAccessValidated } = useAuth();
  const { activeSucursalId } = useSucursal();
  const [settings, setSettings] = useState<MenuSettings | null>(null);
  const [orders, setOrders] = useState<DigitalOrder[]>([]);
  const [orderItems, setOrderItems] = useState<DigitalOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const menuUrl = settings ? buildMenuUrl(settings.public_slug) : "";

  const loadData = useCallback(
    async (background = false) => {
      if (!tenantId || !tenantAccessValidated) return;
      // Require an active sucursal — never load orders without branch isolation.
      if (!activeSucursalId) return;
      if (!background) setLoading(true);
      await ensureAuthSessionFresh();

      const settingsQuery = insforgeClient.database
        .from("digital_menu_settings")
        .select("id, tenant_id, public_slug")
        .eq("tenant_id", tenantId);

      const [settingsRes, ordersRes] = await Promise.all([
        settingsQuery.eq("sucursal_id", activeSucursalId).maybeSingle(),
        insforgeClient.database
          .from("digital_orders")
          .select(
            "id, tenant_id, customer_name, customer_phone, notes, status, total, created_at, order_type, mesa_numero, numero_pedido, sucursal_id"
          )
          .eq("tenant_id", tenantId)
          .eq("sucursal_id", activeSucursalId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (settingsRes.error) console.error(settingsRes.error.message);
      if (ordersRes.error) console.error(ordersRes.error.message);

      const loadedOrders = (ordersRes.data ?? []) as DigitalOrder[];
      const orderIds = loadedOrders.map((order) => order.id);
      let loadedOrderItems: DigitalOrderItem[] = [];

      if (orderIds.length > 0) {
        const orderItemsRes = await insforgeClient.database
          .from("digital_order_items")
          .select("id, order_id, plato_id, name_snapshot, price_snapshot, quantity, subtotal")
          .in("order_id", orderIds);
        if (orderItemsRes.error) console.error(orderItemsRes.error.message);
        loadedOrderItems = (orderItemsRes.data ?? []) as DigitalOrderItem[];
      }

      setSettings((settingsRes.data as MenuSettings | null) ?? null);
      setOrders(loadedOrders);
      setOrderItems(loadedOrderItems);
      setLoading(false);
    },
    [activeSucursalId, tenantId, tenantAccessValidated]
  );

  useEffect(() => {
    if (!authLoading && tenantId && tenantAccessValidated) void loadData();
    if (!authLoading && (!tenantId || !tenantAccessValidated)) setLoading(false);
  }, [authLoading, loadData, tenantId, tenantAccessValidated]);

  useEffect(() => {
    if (!tenantId || !tenantAccessValidated) return;
    const channelName = `cocina:${tenantId}`;
    let active = true;
    const handleDigitalOrderChanged = (msg: unknown) => {
      if (!active) return;
      const m = msg as { meta?: { channel?: string } } | null;
      if (m?.meta?.channel && !m.meta.channel.includes(channelName)) return;
      void loadData(true);
    };

    const registration = tenantRealtimeSubscriptionManager.acquire(channelName, {
      INSERT_digital_order: handleDigitalOrderChanged,
      UPDATE_digital_order: handleDigitalOrderChanged,
      DELETE_digital_order: handleDigitalOrderChanged,
    });

    return () => {
      active = false;
      registration.release();
    };
  }, [tenantId, loadData, tenantAccessValidated]);

  async function updateOrderStatus(order: DigitalOrder, status: "accepted" | "rejected") {
    // Strict sucursal isolation: abort if no active sucursal or order belongs to a different one.
    if (!activeSucursalId) {
      setMessage("Seleccioná una sucursal antes de gestionar pedidos.");
      return;
    }
    if (order.sucursal_id === null || order.sucursal_id !== activeSucursalId) {
      setMessage("Este pedido no pertenece a la sucursal activa.");
      return;
    }

    if (status === "rejected") {
      const { error } = await insforgeClient.database
        .from("digital_orders")
        .delete()
        .eq("id", order.id)
        .eq("tenant_id", order.tenant_id)
        .eq("sucursal_id", activeSucursalId);
      if (error) {
        setMessage(error.message || "No se pudo rechazar el pedido.");
        return;
      }
      setOrders((current) => current.filter((row) => row.id !== order.id));
      return;
    }

    if (status === "accepted") {
      // ── Guard: prevent double-click / concurrent accepts ─────────────────────
      if (acceptingIds.has(order.id)) return;
      setAcceptingIds((prev) => new Set(prev).add(order.id));

      try {
        // ── Idempotent claim: transition pending → accepted atomically ──────────
        // Enforce tenant + sucursal isolation server-side so a rogue client
        // cannot claim another tenant's or branch's order.
        const { data: claimData, error: claimError } = await insforgeClient.database
          .from("digital_orders")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            rejection_reason: null,
          })
          .eq("id", order.id)
          .eq("status", "pending")
          .eq("tenant_id", order.tenant_id)
          .eq("sucursal_id", activeSucursalId)
          .select("id")
          .maybeSingle();

        if (claimError) {
          setMessage(claimError.message || "No se pudo aceptar el pedido.");
          return;
        }

        if (!claimData) {
          // Another session claimed or rejected it already — reload and stop.
          setMessage("El pedido ya fue procesado por otra sesión.");
          void loadData(true);
          return;
        }

        // ── Build comanda and consumos for accepted order ──────────────────────
        const orderLines = orderItems.filter((item) => item.order_id === order.id);
        const isInStore = order.order_type === "in_store" && order.mesa_numero !== null;

        const comandaItems = orderLines.map((line) => ({
          nombre: line.name_snapshot,
          precio: line.quantity > 0 ? line.subtotal / line.quantity : 0,
          cantidad: line.quantity,
          notas: "",
        }));

        const comandaPayload: Record<string, unknown> = {
          tenant_id: tenantId,
          sucursal_id: activeSucursalId,
          estado: "pendiente",
          creado_por: "digital",
          notas: `[DIGITAL${isInStore ? ` Mesa ${order.mesa_numero}` : " Para llevar"}${order.numero_pedido ? ` #${order.numero_pedido}` : ""}] ${order.customer_name}${order.notes ? " - " + order.notes : ""}`,
          items: comandaItems,
        };

        if (isInStore) {
          comandaPayload.mesa_numero = order.mesa_numero;
        }

        const { data: comandaData, error: comandaError } = await insforgeClient.database
          .from("comandas")
          .insert(comandaPayload)
          .select("id")
          .single();

        if (comandaError || !comandaData) {
          // Comanda failed — revert the accepted status back to pending
          await insforgeClient.database
            .from("digital_orders")
            .update({ status: "pending", accepted_at: null })
            .eq("id", order.id)
            .eq("tenant_id", order.tenant_id)
            .eq("sucursal_id", activeSucursalId);
          setMessage(comandaError?.message || "No se pudo crear la comanda para cocina. El pedido fue revertido a pendiente.");
          void loadData(true);
          return;
        }

        const comandaId = (comandaData as { id: string }).id;

        // ── Consumos for in-store orders ──────────────────────────────────────
        if (isInStore && orderLines.length > 0) {
          const consumosPayload = orderLines.map((line) => ({
            tenant_id: tenantId,
            sucursal_id: activeSucursalId,
            comanda_id: comandaId,
            mesa_numero: order.mesa_numero,
            plato_id: line.plato_id ?? null,
            nombre: line.name_snapshot,
            cantidad: line.quantity,
            precio_unitario: line.price_snapshot,
            subtotal: line.subtotal,
            tipo: "cocina",
            estado: "enviado_cocina",
            created_by_auth_user_id: null,
          }));

          const { error: consumosError } = await insforgeClient.database
            .from("consumos")
            .insert(consumosPayload);

          if (consumosError) {
            // Consumos failed — attempt to delete the comanda first.
            // Only revert to pending if the comanda deletion succeeds (prevents
            // orphan comanda + duplicate on retry). If deletion fails, keep the
            // order accepted and surface a manual intervention error.
            const { error: comandaDeleteError } = await insforgeClient.database
              .from("comandas")
              .delete()
              .eq("id", comandaId);

            if (comandaDeleteError) {
              // Comanda could not be deleted — leave order as accepted to avoid
              // a duplicate comanda on retry. Staff must reconcile manually.
              setMessage(
                `Consumos fallaron y la comanda no pudo eliminarse (ID: ${comandaId}). El pedido queda aceptado. Intervención manual requerida.`
              );
            } else {
              // Comanda deleted cleanly — safe to revert order to pending for retry.
              await insforgeClient.database
                .from("digital_orders")
                .update({ status: "pending", accepted_at: null })
                .eq("id", order.id)
                .eq("tenant_id", order.tenant_id)
                .eq("sucursal_id", activeSucursalId);
              setMessage(consumosError.message || "No se pudieron registrar los consumos. El pedido fue revertido a pendiente.");
            }
            void loadData(true);
            return;
          }
        }

        // ── Success: update local state ───────────────────────────────────────
        setOrders((current) =>
          current.map((row) => (row.id === order.id ? { ...row, status: "accepted" } : row))
        );
      } finally {
        setAcceptingIds((prev) => { const s = new Set(prev); s.delete(order.id); return s; });
      }
    }
  }

  async function copyMenuLink() {
    if (!menuUrl) return;
    await navigator.clipboard?.writeText(menuUrl);
    setMessage("Enlace copiado.");
  }

  if (authLoading || loading)
    return <div className="p-8 text-muted-foreground">Cargando pedidos...</div>;

  if (!activeSucursalId)
    return <div className="p-8 text-muted-foreground">Seleccioná una sucursal para ver los pedidos.</div>;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="rounded-[28px] border border-black/10 bg-card p-6 shadow-sm dark:border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Menú digital
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-['Space_Grotesk'] text-3xl font-black text-foreground">
                Pedidos entrantes
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Respondé pedidos entrantes desde el menú público.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void copyMenuLink()}
                disabled={!menuUrl}
                className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-bold uppercase tracking-widest text-foreground disabled:opacity-40 cursor-pointer"
              >
                Copiar link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Menú digital: ${menuUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white no-underline"
              >
                WhatsApp
              </a>
            </div>
          </div>
          {message && (
            <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
              {message}
            </p>
          )}
        </header>

        <section className="rounded-[24px] border border-black/10 bg-card p-5 dark:border-white/10">
          <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">
            Pedidos entrantes
          </h2>
          <div className="mt-4 grid gap-3">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pedidos todavía.</p>
            ) : (
              orders.map((order) => {
                const lines = orderItems.filter((item) => item.order_id === order.id);
                const isInStore = order.order_type === "in_store";
                return (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-border bg-background/60 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-lg text-foreground">{order.customer_name}</strong>

                          {/* Order number badge */}
                          {order.numero_pedido !== null && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                              #{order.numero_pedido}
                            </span>
                          )}

                          {/* Order type badge */}
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                              isInStore
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {orderTypeLabel(order.order_type)}
                            {isInStore && order.mesa_numero !== null && ` ${order.mesa_numero}`}
                          </span>

                          {/* Status badge */}
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                            {order.status}
                          </span>
                        </div>

                        {/* Timestamp + phone */}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(order.created_at).toLocaleString()}
                          {order.customer_phone && (
                            <span className="ml-2 font-medium">📞 {order.customer_phone}</span>
                          )}
                        </p>

                        {order.notes && (
                          <p className="mt-2 text-sm text-foreground">Nota: {order.notes}</p>
                        )}

                        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                          {lines.map((line) => (
                            <li key={line.id}>
                              {line.quantity}× {line.name_snapshot} — {currency(line.subtotal)}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-col gap-2 md:items-end">
                        <strong className="text-xl text-foreground">{currency(order.total)}</strong>
                        {order.status === "pending" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => void updateOrderStatus(order, "accepted")}
                              disabled={acceptingIds.has(order.id)}
                              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase text-white border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {acceptingIds.has(order.id) ? "Aceptando…" : "Aceptar"}
                            </button>
                            <button
                              onClick={() => void updateOrderStatus(order, "rejected")}
                              disabled={acceptingIds.has(order.id)}
                              className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold uppercase text-white border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
      <style>{`.input-field{width:100%;background-color:var(--muted);border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--foreground);outline:none}.input-field:focus{border-color:var(--primary);background-color:transparent}`}</style>
    </div>
  );
}
