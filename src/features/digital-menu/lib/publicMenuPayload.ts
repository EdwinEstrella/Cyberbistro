import type { PublicContact } from "../../menu-links/lib/publicMenuCalendar";
import type { PublicMenuMode } from "./publicMenuMode";
import type { CartLine, PublicMenuItem, PublicMenuSettings } from "../components/PublicMenuOrderScreen";
import { toDeliveryRpcArgs, type DeliveryDraft } from "./deliveryOrder";

export type PublicMenuPayload = {
  settings: PublicMenuSettings | null;
  items: PublicMenuItem[];
  cantidad_mesas: number;
  contact: PublicContact;
};

export const formatCurrency = (value: number, code: string) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: code === "ARS" ? "ARS" : "DOP",
  }).format(value || 0);

export function asMenuPayload(value: unknown): PublicMenuPayload {
  const payload = value as Partial<PublicMenuPayload> | null;
  return {
    settings: payload?.settings ?? null,
    items: Array.isArray(payload?.items) ? payload.items : [],
    cantidad_mesas: Number(payload?.cantidad_mesas ?? 0),
    contact:
      payload?.contact && typeof payload.contact === "object"
        ? (payload.contact as PublicContact)
        : {},
  };
}

export interface BuildCreateOrderRpcArgsParams {
  slug: string;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  cart: CartLine[];
  mode: PublicMenuMode;
  partySize: number | null;
  mesaCodigo?: string | null;
  clientSessionId?: string | null;
  /** Home delivery choice. Only honored for takeout orders; table orders never carry a location. */
  delivery?: DeliveryDraft | null;
}

export function buildCreateOrderRpcArgs({
  slug,
  customerName,
  customerPhone,
  notes,
  cart,
  mode,
  partySize,
  mesaCodigo,
  clientSessionId,
  delivery,
}: BuildCreateOrderRpcArgsParams): Record<string, unknown> {
  const isTable = mode.kind === "table";
  return {
    p_public_slug: slug,
    p_customer_name: customerName.trim(),
    p_customer_phone: customerPhone?.trim() || null,
    p_notes: notes?.trim() || null,
    p_items: cart.map((line) => ({
      plato_id: line.plato_id,
      quantity: line.quantity,
      notes: line.notes ?? null,
    })),
    p_order_type: isTable ? "in_store" : "takeout",
    p_mesa_numero: isTable ? mode.mesa : null,
    p_mesa_codigo: isTable ? mesaCodigo?.trim() || null : null,
    p_client_session_id: clientSessionId || null,
    p_party_size: isTable ? partySize : null,
    ...(!isTable && delivery ? toDeliveryRpcArgs(delivery) : {}),
  };
}

/**
 * Returns or creates a stable per-tenant session ID stored in localStorage.
 * This is used to prevent a browser from placing multiple active in-store orders.
 */
export function getClientSessionId(slug: string): string {
  const key = `cb_session_${slug}`;
  if (typeof localStorage === "undefined") return "test-session";
  const stored = localStorage.getItem(key);
  if (stored && stored.length > 0) return stored;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, id);
  return id;
}
