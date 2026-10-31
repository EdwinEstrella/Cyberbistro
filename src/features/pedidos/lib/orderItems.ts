import type { DigitalOrder, DigitalOrderItem, MenuLinkJoined } from './pedidosTypes';

export interface GroupedOrderItem {
  mainItem: DigitalOrderItem;
  extras: DigitalOrderItem[];
}

export function extractOrderLinkInfo(order: DigitalOrder): {
  isCompanyOrder: boolean;
  companyName: string | null;
  linkLabel: string | null;
  employeeName: string | null;
} {
  const isCompanyOrder = order.order_type === 'company';
  const rawLink = order.menu_links;
  const link: MenuLinkJoined | null = Array.isArray(rawLink)
    ? (rawLink[0] ?? null)
    : (rawLink ?? null);

  const rawCustomer = link?.customer;
  const customer = Array.isArray(rawCustomer)
    ? (rawCustomer[0] ?? null)
    : (rawCustomer ?? null);

  const companyName = customer?.name?.trim() || null;
  const linkLabel = link?.label?.trim() || null;
  const employeeName = order.employee_name?.trim() || null;

  return {
    isCompanyOrder,
    companyName,
    linkLabel,
    employeeName,
  };
}

export function groupOrderItems(items: DigitalOrderItem[]): GroupedOrderItem[] {
  const mainItems: DigitalOrderItem[] = [];
  const extrasByParentId = new Map<string, DigitalOrderItem[]>();
  const allMainIds = new Set<string>();

  for (const item of items) {
    if (!item.parent_item_id) {
      mainItems.push(item);
      allMainIds.add(item.id);
    } else {
      const list = extrasByParentId.get(item.parent_item_id) ?? [];
      list.push(item);
      extrasByParentId.set(item.parent_item_id, list);
    }
  }

  const grouped: GroupedOrderItem[] = mainItems.map((mainItem) => ({
    mainItem,
    extras: extrasByParentId.get(mainItem.id) ?? [],
  }));

  // Handle any orphaned extras (e.g. if parent dish was deleted/missing)
  for (const [parentId, orphanList] of extrasByParentId.entries()) {
    if (!allMainIds.has(parentId)) {
      for (const orphan of orphanList) {
        grouped.push({
          mainItem: orphan,
          extras: [],
        });
      }
    }
  }

  return grouped;
}

export function computeActiveTotal(items: DigitalOrderItem[]): number {
  return items.reduce((sum, item) => {
    if (item.status === 'active') {
      return sum + (Number(item.subtotal) || 0);
    }
    return sum;
  }, 0);
}

export function getActiveItems(items: DigitalOrderItem[]): DigitalOrderItem[] {
  return items.filter((item) => item.status === 'active');
}

export function formatCurrencyDOP(value: number): string {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value || 0);
}

export function formatExtraDisplay(extra: DigitalOrderItem): string {
  return `+ ${extra.name_snapshot} ×${extra.quantity}  ${formatCurrencyDOP(extra.subtotal)}`;
}
