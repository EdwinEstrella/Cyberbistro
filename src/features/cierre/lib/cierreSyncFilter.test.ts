import { describe, expect, it } from 'vitest';
import {
  CIERRE_RELEVANT_TABLES,
  isTableRelevantForCierre,
} from './cierreSyncFilter';

describe('cierreSyncFilter', () => {
  it('declares the expected relevant tables for operational closing', () => {
    expect(CIERRE_RELEVANT_TABLES).toEqual([
      'cierres_operativos',
      'consumos',
      'facturas',
      'gastos',
      'gasto_categorias',
      'mesas_estado',
      'comandas',
    ]);
  });

  it('treats missing, null, or empty tables as relevant to stay safe', () => {
    expect(isTableRelevantForCierre()).toBe(true);
    expect(isTableRelevantForCierre(null)).toBe(true);
    expect(isTableRelevantForCierre([])).toBe(true);
  });

  it('returns true when changed tables intersect with relevant tables', () => {
    expect(isTableRelevantForCierre(['facturas'])).toBe(true);
    expect(isTableRelevantForCierre(['consumos'])).toBe(true);
    expect(isTableRelevantForCierre(['cierres_operativos'])).toBe(true);
    expect(isTableRelevantForCierre(['gastos'])).toBe(true);
    expect(isTableRelevantForCierre(['gasto_categorias'])).toBe(true);
    expect(isTableRelevantForCierre(['mesas_estado'])).toBe(true);
    expect(isTableRelevantForCierre(['comandas'])).toBe(true);
    expect(isTableRelevantForCierre(['payroll_employees', 'facturas'])).toBe(true);
  });

  it('returns false when changed tables do not intersect with relevant tables', () => {
    expect(isTableRelevantForCierre(['payroll_employees'])).toBe(false);
    expect(isTableRelevantForCierre(['payroll_payments', 'payroll_cloud_adjustments'])).toBe(false);
    expect(isTableRelevantForCierre(['customers'])).toBe(false);
    expect(isTableRelevantForCierre(['platos', 'menu_categories'])).toBe(false);
  });
});
