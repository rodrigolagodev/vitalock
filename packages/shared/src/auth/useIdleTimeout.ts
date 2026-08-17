import { useEffect, useRef } from 'react';

/**
 * Standard interactive-app idle window. Common tradeoff between UX and
 * unattended-session risk for internal tools.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
  'visibilitychange',
] as const;

interface UseIdleTimeoutOptions {
  enabled: boolean;
  onIdle: () => void;
  timeoutMs?: number;
}

export function useIdleTimeout({
  enabled,
  onIdle,
  timeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: UseIdleTimeoutOptions): void {
  // Keep the latest onIdle in a ref so listeners never see a stale closure
  // and re-registering listeners on every render is unnecessary.
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    reset();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }

    return () => {
      if (timer) clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [enabled, timeoutMs]);
}
