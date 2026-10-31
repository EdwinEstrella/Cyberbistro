import { describe, expect, it } from 'vitest';
import { mapAcceptOrderError } from './acceptOrderErrors';

describe('mapAcceptOrderError', () => {
  it('maps ORDER_NOT_PENDING to user-friendly message', () => {
    expect(mapAcceptOrderError('ORDER_NOT_PENDING')).toBe(
      'Este pedido ya fue procesado por otra persona.'
    );
    expect(
      mapAcceptOrderError(new Error('rpc error: ORDER_NOT_PENDING'))
    ).toBe('Este pedido ya fue procesado por otra persona.');
    expect(
      mapAcceptOrderError({ message: 'ORDER_NOT_PENDING' })
    ).toBe('Este pedido ya fue procesado por otra persona.');
  });

  it('maps NOT_A_COMPANY_ORDER', () => {
    expect(mapAcceptOrderError('NOT_A_COMPANY_ORDER')).toBe(
      'El pedido no corresponde a una cuenta corporativa.'
    );
  });

  it('maps ORDER_NOT_FOUND', () => {
    expect(mapAcceptOrderError('ORDER_NOT_FOUND')).toBe(
      'El pedido no fue encontrado.'
    );
  });

  it('maps UNAUTHORIZED', () => {
    expect(mapAcceptOrderError('UNAUTHORIZED')).toBe(
      'No tenés permisos para realizar esta acción.'
    );
  });

  it('maps PAYMENTS_EXIST', () => {
    expect(mapAcceptOrderError('PAYMENTS_EXIST')).toBe(
      'No se puede revertir: la cuenta ya tiene pagos registrados.'
    );
  });

  it('maps ORDER_NOT_ACCEPTED', () => {
    expect(mapAcceptOrderError('ORDER_NOT_ACCEPTED')).toBe(
      'El pedido no está en estado aceptado.'
    );
  });

  it('maps network errors to "Se requiere conexión a internet"', () => {
    expect(mapAcceptOrderError(new TypeError('Failed to fetch'))).toBe(
      'Se requiere conexión a internet'
    );
    expect(mapAcceptOrderError(new Error('NetworkError when attempting to fetch resource'))).toBe(
      'Se requiere conexión a internet'
    );
    expect(mapAcceptOrderError(new Error('fetch failed'))).toBe(
      'Se requiere conexión a internet'
    );
    expect(mapAcceptOrderError(new Error('Connection refused'))).toBe(
      'Se requiere conexión a internet'
    );
    expect(mapAcceptOrderError(new Error('offline'))).toBe(
      'Se requiere conexión a internet'
    );
    expect(mapAcceptOrderError({ message: 'Se requiere conexión a internet' })).toBe(
      'Se requiere conexión a internet'
    );
  });

  it('falls back to custom message or default message', () => {
    expect(mapAcceptOrderError(new Error('Error custom inesperado'))).toBe('Error custom inesperado');
    expect(mapAcceptOrderError(null)).toBe('Error desconocido al procesar el pedido.');
    expect(mapAcceptOrderError(undefined)).toBe('Error desconocido al procesar el pedido.');
  });
});
