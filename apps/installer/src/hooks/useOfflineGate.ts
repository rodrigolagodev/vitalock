import { useOnlineStatus } from './useOnlineStatus';

export const OFFLINE_REASON = 'Sin conexión';

/**
 * Gate for mutation controls: `offline` disables them and `reason` is the
 * visible text explaining why (touch devices have no hover tooltips).
 * Reacts to `navigator.onLine` only; server errors keep surfacing as toasts.
 */
export function useOfflineGate(): { offline: boolean; reason: typeof OFFLINE_REASON | undefined } {
  const online = useOnlineStatus();
  return online ? { offline: false, reason: undefined } : { offline: true, reason: OFFLINE_REASON };
}
