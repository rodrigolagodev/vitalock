import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOfflineGate } from '../useOfflineGate';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

afterEach(() => setOnline(true));

describe('useOfflineGate', () => {
  it('reports offline with the reason "Sin conexión"', () => {
    setOnline(false);
    const { result } = renderHook(() => useOfflineGate());
    expect(result.current).toEqual({ offline: true, reason: 'Sin conexión' });
  });

  it('reports online with no reason', () => {
    setOnline(true);
    const { result } = renderHook(() => useOfflineGate());
    expect(result.current).toEqual({ offline: false, reason: undefined });
  });

  it('follows browser online and offline events', () => {
    setOnline(true);
    const { result } = renderHook(() => useOfflineGate());
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.offline).toBe(true);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toEqual({ offline: false, reason: undefined });
  });
});
