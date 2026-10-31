export type ConnectionState = 'online' | 'reconnecting' | 'offline';

export interface ConnectionBarConfig {
  state: ConnectionState;
  text: string;
  color: 'green' | 'amber' | 'red';
  dotClass: string;
  barClass: string;
}

export function computeConnectionState(
  isNavigatorOnline: boolean,
  channelStatus: string | null | undefined
): ConnectionState {
  if (!isNavigatorOnline) {
    return 'offline';
  }
  if (channelStatus === 'SUBSCRIBED') {
    return 'online';
  }
  return 'reconnecting';
}

export function getConnectionBarConfig(state: ConnectionState): ConnectionBarConfig {
  switch (state) {
    case 'online':
      return {
        state: 'online',
        text: 'En línea · tiempo real',
        color: 'green',
        dotClass: 'bg-emerald-500',
        barClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
      };
    case 'reconnecting':
      return {
        state: 'reconnecting',
        text: 'Reconectando…',
        color: 'amber',
        dotClass: 'bg-amber-500 animate-pulse',
        barClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    case 'offline':
      return {
        state: 'offline',
        text: 'Sin conexión — los pedidos online necesitan internet',
        color: 'red',
        dotClass: 'bg-red-500',
        barClass: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
      };
  }
}
