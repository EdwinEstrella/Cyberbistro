import { describe, expect, it } from 'vitest';
import { buildComandaNotas, buildDeliverySummary, isHomeDeliveryOrder } from './comandaLines';
import type { DigitalOrder } from './pedidosTypes';

function order(overrides: Partial<DigitalOrder> = {}): DigitalOrder {
  return {
    id: 'ord-1',
    tenant_id: 't-1',
    customer_name: 'Ana Lopez',
    customer_phone: '8095551234',
    notes: null,
    status: 'pending',
    total: 700,
    created_at: '2026-11-14T12:00:00Z',
    order_type: 'takeout',
    mesa_numero: null,
    numero_pedido: 31,
    sucursal_id: 's-1',
    menu_link_id: null,
    employee_name: null,
    ...overrides,
  };
}

const delivery = {
  delivery_mode: 'delivery',
  delivery_lat: 18.4861,
  delivery_lng: -69.9312,
  delivery_reference: 'Casa azul frente al colmado',
} satisfies Partial<DigitalOrder>;

describe('home delivery on orders', () => {
  it('recognizes only delivery orders, including rows read before the migration', () => {
    expect(isHomeDeliveryOrder(order(delivery))).toBe(true);
    expect(isHomeDeliveryOrder(order({ delivery_mode: 'pickup' }))).toBe(false);
    expect(isHomeDeliveryOrder(order())).toBe(false);
  });

  it('summarizes the reference and the maps link', () => {
    expect(buildDeliverySummary(order(delivery))).toBe(
      'Entrega: Casa azul frente al colmado | Mapa: https://www.google.com/maps?q=18.4861,-69.9312'
    );
  });

  it('summarizes with only the reference or only the pin', () => {
    expect(buildDeliverySummary(order({ ...delivery, delivery_lat: null, delivery_lng: null }))).toBe(
      'Entrega: Casa azul frente al colmado'
    );
    expect(buildDeliverySummary(order({ ...delivery, delivery_reference: '  ' }))).toBe(
      'Mapa: https://www.google.com/maps?q=18.4861,-69.9312'
    );
  });

  it('has no summary for pickup orders', () => {
    expect(buildDeliverySummary(order())).toBeNull();
  });

  it('labels the comanda as Domicilio and appends where to deliver', () => {
    expect(buildComandaNotas(order({ ...delivery, notes: 'Sin cebolla' }))).toBe(
      '[DIGITAL Domicilio #31] Ana Lopez - Sin cebolla | Entrega: Casa azul frente al colmado | Mapa: https://www.google.com/maps?q=18.4861,-69.9312'
    );
  });

  it('keeps the standard takeout notes for a pickup order', () => {
    expect(buildComandaNotas(order())).toBe('[DIGITAL Para llevar #31] Ana Lopez');
  });

  it('never adds a delivery address to company orders', () => {
    expect(buildComandaNotas(order({ ...delivery, order_type: 'company', employee_name: 'Carlos' }), 'Grupo Ramos')).toBe(
      '[DIGITAL Para llevar #31] Empresa: Grupo Ramos - Empleado: Carlos'
    );
  });
});
