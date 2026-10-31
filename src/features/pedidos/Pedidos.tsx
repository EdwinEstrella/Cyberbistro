import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSucursal } from "../../app/context/SucursalContext";
import { useAuth, ensureAuthSessionFresh } from "../../shared/hooks/useAuth";
import { supabase } from "../../shared/lib/supabase";
import { tenantRealtimeSubscriptionManager } from "../../shared/lib/tenantRealtimeSubscriptionManager";
import type {
  DigitalOrder,
  DigitalOrderItem,
  MenuSettings,
} from "./lib/pedidosTypes";
import {
  computeActiveTotal,
  extractOrderLinkInfo,
  formatCurrencyDOP,
  formatExtraDisplay,
  getActiveItems,
  groupOrderItems,
} from "./lib/orderItems";
import {
  getCancelItemConfirmMessage,
  mapCancelItemError,
} from "./lib/cancelItemErrors";
import { mapAcceptOrderError } from "./lib/acceptOrderErrors";
import {
  appendCancelNoteToComanda,
  buildComandaItemsFromOrderItems,
  buildComandaNotas,
} from "./lib/comandaLines";
import {
  computeConnectionState,
  getConnectionBarConfig,
} from "./lib/connectionStatus";
import { createDedupedRefetch } from "./lib/dedupRefetch";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMenuUrl(slug: string) {
  return `https://cloudix-app.azokia.com/#/menu/${encodeURIComponent(slug)}`;
}

function orderTypeLabel(type: string | null | undefined): string {
  if (type === "in_store") return "Mesa";
  if (type === "company") return "Empresa";
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
  const [cancellingItemIds, setCancellingItemIds] = useState<Set<string>>(new Set());

  // Online / Realtime state
  const [isNavigatorOnline, setIsNavigatorOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [channelStatus, setChannelStatus] = useState<string | null>(null);

  const connectionState = useMemo(
    () => computeConnectionState(isNavigatorOnline, channelStatus),
    [isNavigatorOnline, channelStatus]
  );
  const isOffline = connectionState === "offline";
  const barConfig = useMemo(() => getConnectionBarConfig(connectionState), [connectionState]);

  const menuUrl = settings ? buildMenuUrl(settings.public_slug) : "";

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadDataRaw = useCallback(
    async (background = false) => {
      if (!tenantId || !tenantAccessValidated || !activeSucursalId) return;
      if (!background) setLoading(true);
      await ensureAuthSessionFresh();

      const settingsQuery = supabase
        .from("digital_menu_settings")
        .select("id, tenant_id, public_slug")
        .eq("tenant_id", tenantId);

      const [settingsRes, ordersRes] = await Promise.all([
        settingsQuery.eq("sucursal_id", activeSucursalId).maybeSingle(),
        supabase
          .from("digital_orders")
          .select(
            `id, tenant_id, customer_name, customer_phone, notes, status, total, created_at,
             order_type, mesa_numero, numero_pedido, sucursal_id, menu_link_id, employee_name, comanda_id,
             menu_links(label, link_type, customer:customers(name))`
          )
          .eq("tenant_id", tenantId)
          .eq("sucursal_id", activeSucursalId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (settingsRes.error) console.error(settingsRes.error.message);
      if (ordersRes.error) console.error(ordersRes.error.message);

      const loadedOrders = (ordersRes.data ?? []) as unknown as DigitalOrder[];
      const orderIds = loadedOrders.map((order) => order.id);
      let loadedOrderItems: DigitalOrderItem[] = [];

      if (orderIds.length > 0) {
        const orderItemsRes = await supabase
          .from("digital_order_items")
          .select(
            "id, order_id, plato_id, name_snapshot, price_snapshot, quantity, subtotal, status, parent_item_id, notes"
          )
          .in("order_id", orderIds);
        if (orderItemsRes.error) console.error(orderItemsRes.error.message);
        loadedOrderItems = (orderItemsRes.data ?? []) as unknown as DigitalOrderItem[];
      }

      setSettings((settingsRes.data as MenuSettings | null) ?? null);
      setOrders(loadedOrders);
      setOrderItems(loadedOrderItems);
      setLoading(false);
    },
    [activeSucursalId, tenantId, tenantAccessValidated]
  );

  // Deduped refetch runner ref so concurrent calls coalesce
  const dedupedRefetchRef = useRef<() => Promise<void>>(createDedupedRefetch(async () => {}));
  useEffect(() => {
    dedupedRefetchRef.current = createDedupedRefetch(() => loadDataRaw(true));
  }, [loadDataRaw]);

  const loadData = useCallback(
    async (background = false) => {
      if (background) {
        await dedupedRefetchRef.current();
      } else {
        await loadDataRaw(false);
      }
    },
    [loadDataRaw]
  );

  // Initial load
  useEffect(() => {
    if (!authLoading && tenantId && tenantAccessValidated) void loadData();
    if (!authLoading && (!tenantId || !tenantAccessValidated)) setLoading(false);
  }, [authLoading, loadData, tenantId, tenantAccessValidated]);

  // ── Network & Focus Listeners ───────────────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => {
      setIsNavigatorOnline(true);
      void loadData(true);
    };
    const handleOffline = () => {
      setIsNavigatorOnline(false);
    };
    const handleFocus = () => {
      if (navigator.onLine) {
        void loadData(true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadData]);

  // ── Periodic Safety-Net Refetch (every 30s while visible) ────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden && navigator.onLine) {
        void loadData(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadData]);

  // ── Realtime Subscription ───────────────────────────────────────────────────

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

    const registration = tenantRealtimeSubscriptionManager.acquire(
      channelName,
      {
        INSERT_digital_order: handleDigitalOrderChanged,
        UPDATE_digital_order: handleDigitalOrderChanged,
        DELETE_digital_order: handleDigitalOrderChanged,
      },
      (status) => {
        if (!active) return;
        setChannelStatus(status);
        if (status === "SUBSCRIBED") {
          void loadData(true);
        }
      }
    );

    return () => {
      active = false;
      registration.release();
    };
  }, [tenantId, loadData, tenantAccessValidated]);

  // ── Accept & Reject Handlers ────────────────────────────────────────────────

  async function updateOrderStatus(order: DigitalOrder, status: "accepted" | "rejected") {
    if (isOffline) {
      setMessage("Necesitas conexión a internet para gestionar pedidos.");
      return;
    }
    if (!activeSucursalId) {
      setMessage("Seleccioná una sucursal antes de gestionar pedidos.");
      return;
    }
    if (order.sucursal_id === null || order.sucursal_id !== activeSucursalId) {
      setMessage("Este pedido no pertenece a la sucursal activa.");
      return;
    }

    if (status === "rejected") {
      const { error } = await supabase
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
      if (acceptingIds.has(order.id)) return;
      setAcceptingIds((prev) => new Set(prev).add(order.id));

      try {
        const orderLines = orderItems.filter((item) => item.order_id === order.id);
        const activeLines = getActiveItems(orderLines);
        const linkInfo = extractOrderLinkInfo(order);

        // ── 1. Company Orders Accept Flow ─────────────────────────────────────
        if (order.order_type === "company") {
          // Call accept_company_digital_order FIRST (claims pending -> accepted & creates CxC debt atomically)
          const { error: rpcError } = await supabase.rpc("accept_company_digital_order", {
            p_order_id: order.id,
          });

          if (rpcError) {
            setMessage(mapAcceptOrderError(rpcError));
            void loadData(true);
            return;
          }

          // Build comanda using ONLY active items with extras prefixed "+ "
          const comandaItems = buildComandaItemsFromOrderItems(activeLines);
          const comandaNotas = buildComandaNotas(order, linkInfo.companyName);

          const comandaPayload: Record<string, unknown> = {
            tenant_id: tenantId,
            sucursal_id: activeSucursalId,
            estado: "pendiente",
            creado_por: "digital",
            notas: comandaNotas,
            items: comandaItems,
          };

          const { data: comandaData, error: comandaError } = await supabase
            .from("comandas")
            .insert(comandaPayload)
            .select("id")
            .single();

          if (comandaError || !comandaData) {
            // Comanda creation failed: call revert_company_digital_order_accept and show error
            const { error: revertError } = await supabase.rpc("revert_company_digital_order_accept", {
              p_order_id: order.id,
            });
            if (revertError) {
              setMessage(mapAcceptOrderError(revertError));
            } else {
              setMessage(
                comandaError?.message ||
                  "No se pudo crear la comanda para cocina. El pedido fue revertido a pendiente."
              );
            }
            void loadData(true);
            return;
          }

          const comandaId = (comandaData as { id: string }).id;

          // Explicitly link comanda to digital_order
          const { error: updateOrderError } = await supabase
            .from("digital_orders")
            .update({ comanda_id: comandaId })
            .eq("id", order.id);

          if (updateOrderError) {
            console.warn("[Pedidos] Error vinculando comanda_id a digital_order:", updateOrderError);
          }

          // Company orders are charged via CxC: do NOT create consumos or cart checkout.
          setMessage(`Pedido aceptado y cargado a la cuenta de ${linkInfo.companyName || "la empresa"}.`);
          setOrders((current) =>
            current.map((row) => (row.id === order.id ? { ...row, status: "accepted", comanda_id: comandaId } : row))
          );
          return;
        }

        // ── 2. Non-company Orders Accept Flow (takeout / in_store) ─────────────
        const { data: claimData, error: claimError } = await supabase
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
          setMessage(mapAcceptOrderError(claimError));
          return;
        }

        if (!claimData) {
          setMessage(mapAcceptOrderError("ORDER_NOT_PENDING"));
          void loadData(true);
          return;
        }

        const isInStore = order.order_type === "in_store" && order.mesa_numero !== null;
        // Build comanda using active items only, with extras indented
        const comandaItems = buildComandaItemsFromOrderItems(activeLines);
        const comandaNotas = buildComandaNotas(order);

        const comandaPayload: Record<string, unknown> = {
          tenant_id: tenantId,
          sucursal_id: activeSucursalId,
          estado: "pendiente",
          creado_por: "digital",
          notas: comandaNotas,
          items: comandaItems,
        };

        if (isInStore) {
          comandaPayload.mesa_numero = order.mesa_numero;
        }

        const { data: comandaData, error: comandaError } = await supabase
          .from("comandas")
          .insert(comandaPayload)
          .select("id")
          .single();

        if (comandaError || !comandaData) {
          await supabase
            .from("digital_orders")
            .update({ status: "pending", accepted_at: null })
            .eq("id", order.id)
            .eq("tenant_id", order.tenant_id)
            .eq("sucursal_id", activeSucursalId);
          setMessage(
            comandaError?.message ||
              "No se pudo crear la comanda para cocina. El pedido fue revertido a pendiente."
          );
          void loadData(true);
          return;
        }

        const comandaId = (comandaData as { id: string }).id;

        // Explicitly link comanda to digital_order
        const { error: updateOrderError } = await supabase
          .from("digital_orders")
          .update({ comanda_id: comandaId })
          .eq("id", order.id);

        if (updateOrderError) {
          console.warn("[Pedidos] Error vinculando comanda_id a digital_order:", updateOrderError);
        }

        // Consumos for in-store orders (excluding cancelled items)
        if (isInStore && activeLines.length > 0) {
          const consumosPayload = activeLines.map((line) => ({
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

          const { error: consumosError } = await supabase
            .from("consumos")
            .insert(consumosPayload);

          if (consumosError) {
            const { error: comandaDeleteError } = await supabase
              .from("comandas")
              .delete()
              .eq("id", comandaId);

            if (comandaDeleteError) {
              setMessage(
                `Consumos fallaron y la comanda no pudo eliminarse (ID: ${comandaId}). El pedido queda aceptado. Intervención manual requerida.`
              );
            } else {
              await supabase
                .from("digital_orders")
                .update({ status: "pending", accepted_at: null, comanda_id: null })
                .eq("id", order.id)
                .eq("tenant_id", order.tenant_id)
                .eq("sucursal_id", activeSucursalId);
              setMessage(
                consumosError.message ||
                  "No se pudieron registrar los consumos. El pedido fue revertido a pendiente."
              );
            }
            void loadData(true);
            return;
          }
        }

        setOrders((current) =>
          current.map((row) => (row.id === order.id ? { ...row, status: "accepted", comanda_id: comandaId } : row))
        );
      } catch (err) {
        setMessage(mapAcceptOrderError(err));
      } finally {
        setAcceptingIds((prev) => {
          const s = new Set(prev);
          s.delete(order.id);
          return s;
        });
      }
    }
  }

  // ── Per-item Cancel Handler ─────────────────────────────────────────────────

  async function handleCancelItem(order: DigitalOrder, item: DigitalOrderItem) {
    if (isOffline) {
      setMessage("Necesitas conexión a internet para cancelar ítems.");
      return;
    }
    const isCompanyOrder = order.order_type === "company";
    const confirmText = getCancelItemConfirmMessage(item.name_snapshot, isCompanyOrder);
    if (!window.confirm(confirmText)) {
      return;
    }

    if (cancellingItemIds.has(item.id)) return;
    setCancellingItemIds((prev) => new Set(prev).add(item.id));

    try {
      const { data, error } = await supabase.rpc("cancel_digital_order_item", {
        p_item_id: item.id,
      });

      if (error) {
        setMessage(mapCancelItemError(error));
        return;
      }

      const res = data as {
        order_id: string;
        item_id: string;
        new_total: number;
        active_items_count: number;
        order_status: string;
      } | null;

      // Inform the kitchen if comanda already exists for accepted order
      if (order.status === "accepted" && tenantId && activeSucursalId) {
        try {
          if (order.comanda_id) {
            const { data: directComanda } = await supabase
              .from("comandas")
              .select("id, notas")
              .eq("id", order.comanda_id)
              .maybeSingle();

            if (directComanda) {
              const updatedNotas = appendCancelNoteToComanda(
                directComanda.notas,
                item.name_snapshot
              );
              await supabase
                .from("comandas")
                .update({ notas: updatedNotas, updated_at: new Date().toISOString() })
                .eq("id", directComanda.id);
            }
          } else {
            // Fall back to the old best-effort lookup when comanda_id is null (orders accepted before this change)
            let comandaQuery = supabase
              .from("comandas")
              .select("id, notas")
              .eq("tenant_id", tenantId)
              .eq("creado_por", "digital");

            if (order.numero_pedido !== null) {
              comandaQuery = comandaQuery.ilike("notas", `%#${order.numero_pedido}%`);
            } else {
              comandaQuery = comandaQuery.ilike("notas", `%${order.customer_name}%`);
            }

            const { data: matchedComandas } = await comandaQuery
              .order("created_at", { ascending: false })
              .limit(1);

            if (matchedComandas && matchedComandas.length > 0) {
              const targetComanda = matchedComandas[0];
              const updatedNotas = appendCancelNoteToComanda(
                targetComanda.notas,
                item.name_snapshot
              );
              await supabase
                .from("comandas")
                .update({ notas: updatedNotas, updated_at: new Date().toISOString() })
                .eq("id", targetComanda.id);
            }
          }
        } catch (comandaErr) {
          console.warn("[Pedidos] Error actualizando comanda con ítem cancelado:", comandaErr);
        }
      }

      setMessage(`Ítem "${item.name_snapshot}" cancelado.`);

      // Update local state and trigger full reload
      if (res) {
        setOrders((current) =>
          current.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  total: Number(res.new_total),
                  status: res.order_status,
                }
              : o
          )
        );
      }
      void loadData(true);
    } catch (err) {
      setMessage(mapCancelItemError(err));
    } finally {
      setCancellingItemIds((prev) => {
        const s = new Set(prev);
        s.delete(item.id);
        return s;
      });
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
        {/* Connection status bar */}
        <div
          className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${barConfig.barClass}`}
        >
          <span className={`inline-block size-2 rounded-full ${barConfig.dotClass}`} />
          <span>{barConfig.text}</span>
        </div>

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
                Respondé pedidos entrantes desde el menú público o corporativo.
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
                const grouped = groupOrderItems(lines);
                const activeTotal = computeActiveTotal(lines);
                const linkInfo = extractOrderLinkInfo(order);
                const isInStore = order.order_type === "in_store";
                const isCompany = order.order_type === "company";
                const isEditable = order.status === "pending" || order.status === "accepted";

                return (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-border bg-background/60 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-lg text-foreground">
                            {order.customer_name}
                          </strong>

                          {/* Order number badge */}
                          {order.numero_pedido !== null && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                              #{order.numero_pedido}
                            </span>
                          )}

                          {/* Order type badge */}
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                              isCompany
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                : isInStore
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {orderTypeLabel(order.order_type)}
                            {isInStore && order.mesa_numero !== null && ` ${order.mesa_numero}`}
                          </span>

                          {/* Status badge */}
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                              order.status === "accepted"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : order.status === "rejected"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {order.status}
                          </span>

                          {/* Company & Employee badges for company orders */}
                          {isCompany && (
                            <>
                              {linkInfo.companyName && (
                                <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-bold">
                                  Empresa: {linkInfo.companyName}
                                </span>
                              )}
                              {linkInfo.employeeName && (
                                <span className="rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 px-2 py-0.5 text-[10px] font-bold">
                                  Empleado: {linkInfo.employeeName}
                                </span>
                              )}
                            </>
                          )}

                          {/* Public link label for non-company orders */}
                          {!isCompany && linkInfo.linkLabel && (
                            <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
                              {linkInfo.linkLabel}
                            </span>
                          )}
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

                        {/* Items list with nested extras and per-item cancel */}
                        <ul className="mt-3 space-y-2 text-sm">
                          {grouped.map(({ mainItem, extras }) => {
                            const isMainCancelled = mainItem.status === "cancelled";

                            return (
                              <li key={mainItem.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    className={`flex items-center gap-2 ${
                                      isMainCancelled
                                        ? "line-through text-muted-foreground/60"
                                        : "text-foreground"
                                    }`}
                                  >
                                    <span>
                                      {mainItem.quantity}× {mainItem.name_snapshot} —{" "}
                                      {formatCurrencyDOP(mainItem.subtotal)}
                                    </span>
                                    {isMainCancelled && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground no-underline">
                                        Cancelado
                                      </span>
                                    )}
                                  </div>

                                  {!isMainCancelled && isEditable && (
                                    <button
                                      type="button"
                                      onClick={() => void handleCancelItem(order, mainItem)}
                                      disabled={isOffline || cancellingItemIds.has(mainItem.id)}
                                      title={isOffline ? "Necesita internet" : undefined}
                                      className="rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive hover:bg-destructive/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {cancellingItemIds.has(mainItem.id) ? "Cancelando…" : "Cancelar"}
                                    </button>
                                  )}
                                </div>

                                {/* Nested extras */}
                                {extras.length > 0 && (
                                  <ul className="ml-4 space-y-1 border-l-2 border-border/50 pl-2.5">
                                    {extras.map((extra) => {
                                      const isExtraCancelled = extra.status === "cancelled";

                                      return (
                                        <li
                                          key={extra.id}
                                          className="flex items-center justify-between gap-2 text-xs"
                                        >
                                          <div
                                            className={`flex items-center gap-2 ${
                                              isExtraCancelled
                                                ? "line-through text-muted-foreground/60"
                                                : "text-muted-foreground"
                                            }`}
                                          >
                                            <span>{formatExtraDisplay(extra)}</span>
                                            {isExtraCancelled && (
                                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground no-underline">
                                                Cancelado
                                              </span>
                                            )}
                                          </div>

                                          {!isExtraCancelled && isEditable && (
                                            <button
                                              type="button"
                                              onClick={() => void handleCancelItem(order, extra)}
                                              disabled={isOffline || cancellingItemIds.has(extra.id)}
                                              title={isOffline ? "Necesita internet" : undefined}
                                              className="rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive hover:bg-destructive/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                              {cancellingItemIds.has(extra.id)
                                                ? "Cancelando…"
                                                : "Cancelar"}
                                            </button>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {/* Card summary & action buttons */}
                      <div className="flex flex-col gap-2 md:items-end shrink-0">
                        <strong className="text-xl text-foreground">
                          {formatCurrencyDOP(activeTotal)}
                        </strong>
                        {order.status === "pending" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => void updateOrderStatus(order, "accepted")}
                              disabled={isOffline || acceptingIds.has(order.id)}
                              title={isOffline ? "Necesita internet" : undefined}
                              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase text-white border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {acceptingIds.has(order.id) ? "Aceptando…" : "Aceptar"}
                            </button>
                            <button
                              onClick={() => void updateOrderStatus(order, "rejected")}
                              disabled={isOffline || acceptingIds.has(order.id)}
                              title={isOffline ? "Necesita internet" : undefined}
                              className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold uppercase text-white border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
