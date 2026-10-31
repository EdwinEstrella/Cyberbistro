import { describe, it, expect } from 'vitest';
import {
  extractOrderLinkInfo,
  groupOrderItems,
  computeActiveTotal,
  getActiveItems,
  formatExtraDisplay,
} from './orderItems';
import type { DigitalOrder, DigitalOrderItem } from './pedidosTypes';

describe('orderItems lib', () => {
  describe('extractOrderLinkInfo', () => {
    it('extracts company name, employee name, and link info for company orders', () => {
      const order: DigitalOrder = {
        id: 'ord-1',
        tenant_id: 't-1',
        customer_name: 'Juan Perez',
        customer_phone: null,
        notes: null,
        status: 'pending',
        total: 250,
        created_at: new Date().toISOString(),
        order_type: 'company',
        mesa_numero: null,
        numero_pedido: 10,
        sucursal_id: 'suc-1',
        menu_link_id: 'link-1',
        employee_name: 'Juan Perez',
        menu_links: {
          label: 'Acme Corp Menu',
          link_type: 'company',
          customer: { name: 'Acme Corp' },
        },
      };

      const info = extractOrderLinkInfo(order);
      expect(info.isCompanyOrder).toBe(true);
      expect(info.companyName).toBe('Acme Corp');
      expect(info.employeeName).toBe('Juan Perez');
      expect(info.linkLabel).toBe('Acme Corp Menu');
    });

    it('handles menu_links returned as array from PostgREST', () => {
      const order: DigitalOrder = {
        id: 'ord-2',
        tenant_id: 't-1',
        customer_name: 'Maria Gomez',
        customer_phone: null,
        notes: null,
        status: 'pending',
        total: 150,
        created_at: new Date().toISOString(),
        order_type: 'takeout',
        mesa_numero: null,
        numero_pedido: 11,
        sucursal_id: 'suc-1',
        menu_link_id: 'link-2',
        employee_name: null,
        menu_links: [
          {
            label: 'Public Lunch Link',
            link_type: 'public',
            customer: null,
          },
        ],
      };

      const info = extractOrderLinkInfo(order);
      expect(info.isCompanyOrder).toBe(false);
      expect(info.companyName).toBeNull();
      expect(info.linkLabel).toBe('Public Lunch Link');
    });
  });

  describe('groupOrderItems', () => {
    it('nests extras under their respective main dish item', () => {
      const dish1: DigitalOrderItem = {
        id: 'item-1',
        order_id: 'ord-1',
        plato_id: 101,
        name_snapshot: 'Hamburguesa Clasica',
        price_snapshot: 300,
        quantity: 1,
        subtotal: 300,
        status: 'active',
        parent_item_id: null,
      };

      const extra1: DigitalOrderItem = {
        id: 'extra-1',
        order_id: 'ord-1',
        plato_id: 201,
        name_snapshot: 'Papas extra',
        price_snapshot: 50,
        quantity: 1,
        subtotal: 50,
        status: 'active',
        parent_item_id: 'item-1',
      };

      const extra2: DigitalOrderItem = {
        id: 'extra-2',
        order_id: 'ord-1',
        plato_id: 202,
        name_snapshot: 'Queso adicional',
        price_snapshot: 40,
        quantity: 1,
        subtotal: 40,
        status: 'cancelled',
        parent_item_id: 'item-1',
      };

      const dish2: DigitalOrderItem = {
        id: 'item-2',
        order_id: 'ord-1',
        plato_id: 102,
        name_snapshot: 'Refresco',
        price_snapshot: 60,
        quantity: 2,
        subtotal: 120,
        status: 'active',
        parent_item_id: null,
      };

      const grouped = groupOrderItems([dish1, extra1, extra2, dish2]);
      expect(grouped).toHaveLength(2);
      expect(grouped[0].mainItem.id).toBe('item-1');
      expect(grouped[0].extras).toHaveLength(2);
      expect(grouped[0].extras[0].name_snapshot).toBe('Papas extra');
      expect(grouped[0].extras[1].status).toBe('cancelled');

      expect(grouped[1].mainItem.id).toBe('item-2');
      expect(grouped[1].extras).toHaveLength(0);
    });

    it('retains orphan extras without parent item', () => {
      const orphanExtra: DigitalOrderItem = {
        id: 'extra-orphan',
        order_id: 'ord-1',
        plato_id: 205,
        name_snapshot: 'Salsa extra',
        price_snapshot: 20,
        quantity: 1,
        subtotal: 20,
        status: 'active',
        parent_item_id: 'unknown-parent',
      };

      const grouped = groupOrderItems([orphanExtra]);
      expect(grouped).toHaveLength(1);
      expect(grouped[0].mainItem.id).toBe('extra-orphan');
    });
  });

  describe('computeActiveTotal & getActiveItems', () => {
    it('sums only active items and ignores cancelled ones', () => {
      const items: DigitalOrderItem[] = [
        {
          id: '1',
          order_id: 'ord-1',
          plato_id: 1,
          name_snapshot: 'Plato A',
          price_snapshot: 200,
          quantity: 1,
          subtotal: 200,
          status: 'active',
          parent_item_id: null,
        },
        {
          id: '2',
          order_id: 'ord-1',
          plato_id: 2,
          name_snapshot: 'Extra A',
          price_snapshot: 50,
          quantity: 1,
          subtotal: 50,
          status: 'active',
          parent_item_id: '1',
        },
        {
          id: '3',
          order_id: 'ord-1',
          plato_id: 3,
          name_snapshot: 'Plato Cancelado',
          price_snapshot: 150,
          quantity: 1,
          subtotal: 150,
          status: 'cancelled',
          parent_item_id: null,
        },
      ];

      expect(computeActiveTotal(items)).toBe(250);
      expect(getActiveItems(items)).toHaveLength(2);
      expect(getActiveItems(items).map((i) => i.id)).toEqual(['1', '2']);
    });
  });

  describe('formatExtraDisplay', () => {
    it('formats extra line cleanly', () => {
      const extra: DigitalOrderItem = {
        id: 'ex-1',
        order_id: 'ord-1',
        plato_id: 1,
        name_snapshot: 'Papa extra',
        price_snapshot: 50,
        quantity: 1,
        subtotal: 50,
        status: 'active',
        parent_item_id: 'main-1',
      };

      const formatted = formatExtraDisplay(extra);
      expect(formatted).toContain('+ Papa extra ×1');
      expect(formatted).toContain('50');
    });
  });
});
