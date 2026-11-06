import { describe, expect, it } from 'vitest';
import { areCierreRowsEqual } from './cierreStructuralEquality';

describe('areCierreRowsEqual', () => {
  it('returns true for same references and both nullish/empty', () => {
    const list = [{ id: '1', updated_at: '2026-01-01T00:00:00Z' }];
    expect(areCierreRowsEqual(list, list)).toBe(true);
    expect(areCierreRowsEqual([], [])).toBe(true);
    expect(areCierreRowsEqual(null, null)).toBe(true);
    expect(areCierreRowsEqual(undefined, undefined)).toBe(true);
  });

  it('returns false when one is nullish and other is not, or lengths differ', () => {
    const row = { id: '1' };
    expect(areCierreRowsEqual([row], null)).toBe(false);
    expect(areCierreRowsEqual(null, [row])).toBe(false);
    expect(areCierreRowsEqual([row], [])).toBe(false);
    expect(areCierreRowsEqual([row], [row, { id: '2' }])).toBe(false);
  });

  it('returns true when rows have identical ids and updated_at', () => {
    const prev = [
      { id: '1', updated_at: '2026-01-01T10:00:00Z', total: 100 },
      { id: '2', updated_at: '2026-01-01T11:00:00Z', total: 200 },
    ];
    const next = [
      { id: '1', updated_at: '2026-01-01T10:00:00Z', total: 100 },
      { id: '2', updated_at: '2026-01-01T11:00:00Z', total: 200 },
    ];
    expect(areCierreRowsEqual(prev, next)).toBe(true);
  });

  it('detects changes when updated_at differs', () => {
    const prev = [{ id: '1', updated_at: '2026-01-01T10:00:00Z' }];
    const next = [{ id: '1', updated_at: '2026-01-01T10:05:00Z' }];
    expect(areCierreRowsEqual(prev, next)).toBe(false);
  });

  it('detects changes when id differs or row order changes', () => {
    const prev = [{ id: '1' }, { id: '2' }];
    const next = [{ id: '2' }, { id: '1' }];
    expect(areCierreRowsEqual(prev, next)).toBe(false);
  });

  it('detects changes when closed_at or estado differs despite same updated_at', () => {
    const prevCycle: Array<{ id: string; updated_at: string; closed_at: string | null }> = [
      { id: 'c1', updated_at: '2026-01-01', closed_at: null },
    ];
    const nextCycle: Array<{ id: string; updated_at: string; closed_at: string | null }> = [
      { id: 'c1', updated_at: '2026-01-01', closed_at: '2026-01-01T23:00:00Z' },
    ];
    expect(areCierreRowsEqual(prevCycle, nextCycle)).toBe(false);

    const prevConsumo = [{ id: 'con1', updated_at: '2026-01-01', estado: 'abierto' }];
    const nextConsumo = [{ id: 'con1', updated_at: '2026-01-01', estado: 'pagado' }];
    expect(areCierreRowsEqual(prevConsumo, nextConsumo)).toBe(false);
  });

  it('compares shallow keys when updated_at is absent', () => {
    const prev = [{ id: 'cat-1', nombre: 'Cocina' }];
    const nextEqual = [{ id: 'cat-1', nombre: 'Cocina' }];
    const nextDifferent = [{ id: 'cat-1', nombre: 'Bar' }];

    expect(areCierreRowsEqual(prev, nextEqual)).toBe(true);
    expect(areCierreRowsEqual(prev, nextDifferent)).toBe(false);
  });
});
