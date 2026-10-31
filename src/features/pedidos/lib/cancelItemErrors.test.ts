import { describe, it, expect } from 'vitest';
import { getCancelItemConfirmMessage, mapCancelItemError } from './cancelItemErrors';

describe('cancelItemErrors', () => {
  describe('getCancelItemConfirmMessage', () => {
    it('returns message with accounts receivable notice for company order', () => {
      const msg = getCancelItemConfirmMessage('Papa frita', true);
      expect(msg).toBe('¿Cancelar Papa frita? Se descuenta del total y de la cuenta por cobrar.');
    });

    it('returns standard total discount message for non-company order', () => {
      const msg = getCancelItemConfirmMessage('Hamburguesa', false);
      expect(msg).toBe('¿Cancelar Hamburguesa? Se descuenta del total.');
    });
  });

  describe('mapCancelItemError', () => {
    it('maps PAYMENT_EXCEEDS_TOTAL correctly', () => {
      expect(mapCancelItemError(new Error('PAYMENT_EXCEEDS_TOTAL'))).toBe(
        'La cuenta ya tiene pagos mayores al nuevo total'
      );
      expect(mapCancelItemError({ message: 'Error: PAYMENT_EXCEEDS_TOTAL' })).toBe(
        'La cuenta ya tiene pagos mayores al nuevo total'
      );
    });

    it('maps ITEM_NOT_ACTIVE correctly', () => {
      expect(mapCancelItemError('ITEM_NOT_ACTIVE')).toBe(
        'El ítem ya fue cancelado o no está activo.'
      );
    });

    it('maps ORDER_NOT_EDITABLE correctly', () => {
      expect(mapCancelItemError(new Error('ORDER_NOT_EDITABLE'))).toBe(
        'El pedido no se puede editar en su estado actual.'
      );
    });

    it('maps UNAUTHORIZED correctly', () => {
      expect(mapCancelItemError({ message: 'UNAUTHORIZED' })).toBe(
        'No tenés permisos para modificar este pedido.'
      );
    });

    it('maps network errors correctly', () => {
      expect(mapCancelItemError(new TypeError('Failed to fetch'))).toBe(
        'Error de conexión al cancelar el ítem. Verificá tu internet.'
      );
    });
  });
});
