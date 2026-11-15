import type { DigitalOrder, DigitalOrderItem } from './pedidosTypes';
import { buildMapsUrl } from '../../digital-menu/lib/deliveryOrder';

export interface ComandaItemPayload {
  nombre: string;
  precio: number;
  cantidad: number;
  notas: string;
}

export function buildComandaItemsFromOrderItems(activeItems: DigitalOrderItem[]): ComandaItemPayload[] {
  const mainItems: DigitalOrderItem[] = [];
  const extrasByParentId = new Map<string, DigitalOrderItem[]>();
  const mainIds = new Set<string>();

  for (const item of activeItems) {
    if (!item.parent_item_id) {
      mainItems.push(item);
      mainIds.add(item.id);
    } else {
      const list = extrasByParentId.get(item.parent_item_id) ?? [];
      list.push(item);
      extrasByParentId.set(item.parent_item_id, list);
    }
  }

  const result: ComandaItemPayload[] = [];

  for (const dish of mainItems) {
    result.push({
      nombre: dish.name_snapshot,
      precio: dish.quantity > 0 ? dish.subtotal / dish.quantity : dish.price_snapshot,
      cantidad: dish.quantity,
      notas: dish.notes || '',
    });

    const dishExtras = extrasByParentId.get(dish.id) ?? [];
    for (const extra of dishExtras) {
      result.push({
        nombre: `+ ${extra.name_snapshot}`,
        precio: extra.quantity > 0 ? extra.subtotal / extra.quantity : extra.price_snapshot,
        cantidad: extra.quantity,
        notas: '',
      });
    }
  }

  // Any orphan active extras whose parent dish was not in the active list
  for (const [parentId, extras] of extrasByParentId.entries()) {
    if (!mainIds.has(parentId)) {
      for (const extra of extras) {
        result.push({
          nombre: `+ ${extra.name_snapshot}`,
          precio: extra.quantity > 0 ? extra.subtotal / extra.quantity : extra.price_snapshot,
          cantidad: extra.quantity,
          notas: '',
        });
      }
    }
  }

  return result;
}

export function buildComandaNotas(order: DigitalOrder, companyName?: string | null): string {
  const isInStore = order.order_type === 'in_store' && order.mesa_numero !== null;

  if (order.order_type === 'company') {
    const prefix = `[DIGITAL Para llevar${order.numero_pedido ? ` #${order.numero_pedido}` : ''}]`;
    const employee = order.employee_name || order.customer_name;
    const body = companyName
      ? `Empresa: ${companyName} - Empleado: ${employee}`
      : `Empleado: ${employee}`;
    return `${prefix} ${body}${order.notes ? ` - ${order.notes}` : ''}`;
  }

  const deliverySummary = buildDeliverySummary(order);
  const label = isInStore ? ` Mesa ${order.mesa_numero}` : deliverySummary ? ' Domicilio' : ' Para llevar';
  return `[DIGITAL${label}${order.numero_pedido ? ` #${order.numero_pedido}` : ''}] ${order.customer_name}${order.notes ? ` - ${order.notes}` : ''}${deliverySummary ? ` | ${deliverySummary}` : ''}`;
}

export function isHomeDeliveryOrder(order: Pick<DigitalOrder, 'delivery_mode'>): boolean {
  return order.delivery_mode === 'delivery';
}

/**
 * Where to take a home-delivery order: the customer's reference text and a maps link when they pinned a location.
 * Null for pickup, table and company orders.
 */
export function buildDeliverySummary(
  order: Pick<DigitalOrder, 'delivery_mode' | 'delivery_lat' | 'delivery_lng' | 'delivery_reference'>
): string | null {
  if (!isHomeDeliveryOrder(order)) return null;
  const parts: string[] = [];
  const reference = order.delivery_reference?.trim();
  if (reference) parts.push(`Entrega: ${reference}`);
  const mapsUrl = buildMapsUrl(order.delivery_lat, order.delivery_lng);
  if (mapsUrl) parts.push(`Mapa: ${mapsUrl}`);
  return parts.length > 0 ? parts.join(' | ') : 'Entrega a domicilio';
}

export function appendCancelNoteToComanda(
  existingNotas: string | null | undefined,
  itemName: string
): string {
  const cancelLine = `CANCELADO: ${itemName}`;
  const trimmed = existingNotas?.trim();
  if (!trimmed) {
    return cancelLine;
  }
  return `${trimmed}\n${cancelLine}`;
}
