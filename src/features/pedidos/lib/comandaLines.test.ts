import { describe, it, expect } from 'vitest';
import {
  buildComandaItemsFromOrderItems,
  buildComandaNotas,
  appendCancelNoteToComanda,
} from './comandaLines';
import type { DigitalOrder, DigitalOrderItem } from './pedidosTypes';

describe('comandaLines', () => {
  describe('buildComandaItemsFromOrderItems', () => {
    it('indents extras with "+ " right after their parent dish', () => {
      const items: DigitalOrderItem[] = [
        {
          id: 'dish-1',
          order_id: 'ord-1',
          plato_id: 10,
          name_snapshot: 'Pechuga a la plancha',
          price_snapshot: 350,
          quantity: 1,
          subtotal: 350,
          status: 'active',
          parent_item_id: null,
          notes: 'Bien cocida',
        },
        {
          id: 'extra-1',
          order_id: 'ord-1',
          plato_id: 20,
          name_snapshot: 'Papa salteada extra',
          price_snapshot: 75,
          quantity: 1,
          subtotal: 75,
          status: 'active',
          parent_item_id: 'dish-1',
        },
        {
          id: 'dish-2',
          order_id: 'ord-1',
          plato_id: 11,
          name_snapshot: 'Jugo natural',
          price_snapshot: 100,
          quantity: 2,
          subtotal: 200,
          status: 'active',
          parent_item_id: null,
        },
      ];

      const comandaItems = buildComandaItemsFromOrderItems(items);
      expect(comandaItems).toHaveLength(3);
      expect(comandaItems[0]).toEqual({
        nombre: 'Pechuga a la plancha',
        precio: 350,
        cantidad: 1,
        notas: 'Bien cocida',
      });
      expect(comandaItems[1]).toEqual({
        nombre: '+ Papa salteada extra',
        precio: 75,
        cantidad: 1,
        notas: '',
      });
      expect(comandaItems[2]).toEqual({
        nombre: 'Jugo natural',
        precio: 100,
        cantidad: 2,
        notas: '',
      });
    });
  });

  describe('buildComandaNotas', () => {
    it('builds company order notas with customer and employee info', () => {
      const order: DigitalOrder = {
        id: 'ord-1',
        tenant_id: 't-1',
        customer_name: 'Carlos Ruiz',
        customer_phone: null,
        notes: 'Sin cebolla',
        status: 'pending',
        total: 500,
        created_at: new Date().toISOString(),
        order_type: 'company',
        mesa_numero: null,
        numero_pedido: 42,
        sucursal_id: 's-1',
        menu_link_id: 'l-1',
        employee_name: 'Carlos Ruiz',
      };

      const notas = buildComandaNotas(order, 'Grupo Ramos');
      expect(notas).toBe('[DIGITAL Para llevar #42] Empresa: Grupo Ramos - Empleado: Carlos Ruiz - Sin cebolla');
    });

    it('builds standard takeout notas for non-company order', () => {
      const order: DigitalOrder = {
        id: 'ord-2',
        tenant_id: 't-1',
        customer_name: 'Ana Lopez',
        customer_phone: null,
        notes: null,
        status: 'pending',
        total: 300,
        created_at: new Date().toISOString(),
        order_type: 'takeout',
        mesa_numero: null,
        numero_pedido: 43,
        sucursal_id: 's-1',
        menu_link_id: null,
        employee_name: null,
      };

      const notas = buildComandaNotas(order);
      expect(notas).toBe('[DIGITAL Para llevar #43] Ana Lopez');
    });
  });

  describe('appendCancelNoteToComanda', () => {
    it('appends cancellation notice line to existing notas', () => {
      const existing = '[DIGITAL Para llevar #42] Empresa: Grupo Ramos';
      const updated = appendCancelNoteToComanda(existing, 'Papa salteada extra');
      expect(updated).toBe('[DIGITAL Para llevar #42] Empresa: Grupo Ramos\nCANCELADO: Papa salteada extra');
    });

    it('creates cancellation notice line if existing notas was empty', () => {
      const updated = appendCancelNoteToComanda('', 'Hamburguesa');
      expect(updated).toBe('CANCELADO: Hamburguesa');
    });
  });
});
