import { describe, it, expect } from 'vitest';
import { computeConnectionState, getConnectionBarConfig } from './connectionStatus';

describe('connectionStatus', () => {
  describe('computeConnectionState', () => {
    it('returns offline when navigator is offline regardless of channel', () => {
      expect(computeConnectionState(false, 'SUBSCRIBED')).toBe('offline');
      expect(computeConnectionState(false, null)).toBe('offline');
      expect(computeConnectionState(false, 'CHANNEL_ERROR')).toBe('offline');
    });

    it('returns online when online and channel is SUBSCRIBED', () => {
      expect(computeConnectionState(true, 'SUBSCRIBED')).toBe('online');
    });

    it('returns reconnecting when online but channel is not SUBSCRIBED', () => {
      expect(computeConnectionState(true, null)).toBe('reconnecting');
      expect(computeConnectionState(true, 'TIMED_OUT')).toBe('reconnecting');
      expect(computeConnectionState(true, 'CHANNEL_ERROR')).toBe('reconnecting');
      expect(computeConnectionState(true, 'CLOSED')).toBe('reconnecting');
    });
  });

  describe('getConnectionBarConfig', () => {
    it('returns green config for online', () => {
      const config = getConnectionBarConfig('online');
      expect(config.text).toBe('En línea · tiempo real');
      expect(config.color).toBe('green');
    });

    it('returns amber config for reconnecting', () => {
      const config = getConnectionBarConfig('reconnecting');
      expect(config.text).toBe('Reconectando…');
      expect(config.color).toBe('amber');
    });

    it('returns red config for offline', () => {
      const config = getConnectionBarConfig('offline');
      expect(config.text).toBe('Sin conexión — los pedidos online necesitan internet');
      expect(config.color).toBe('red');
    });
  });
});
