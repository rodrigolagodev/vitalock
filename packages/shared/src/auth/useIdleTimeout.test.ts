import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DEFAULT_IDLE_TIMEOUT_MS, useIdleTimeout } from './useIdleTimeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useIdleTimeout', () => {
  it('calls onIdle after the default 30 minutes without activity', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: true, onIdle }));

    vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('restarts the countdown on user activity', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: true, onIdle, timeoutMs: 1000 }));

    vi.advanceTimersByTime(800);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(800);
    expect(onIdle).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('mousemove'));
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleTimeout({ enabled: false, onIdle, timeoutMs: 1000 }));
    vi.advanceTimersByTime(10_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('stops the timer and listeners on unmount', () => {
    const onIdle = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useIdleTimeout({ enabled: true, onIdle, timeoutMs: 1000 }),
    );

    unmount();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('stops when it becomes disabled (e.g. after sign-out)', () => {
    const onIdle = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useIdleTimeout({ enabled, onIdle, timeoutMs: 1000 }),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('always calls the latest onIdle without restarting the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onIdle }) => useIdleTimeout({ enabled: true, onIdle, timeoutMs: 1000 }),
      { initialProps: { onIdle: first } },
    );

    vi.advanceTimersByTime(600);
    rerender({ onIdle: second });
    vi.advanceTimersByTime(400);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
