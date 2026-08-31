import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarCollapsed } from '../useSidebarCollapsed';

const STORAGE_KEY = 'vitalock-sidebar-collapsed';

const localStorageMock = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    _store: store,
  };
});

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    localStorageMock._store.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    // Expose the mock in the test env (jsdom provides localStorage).
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to expanded (false) when no localStorage entry exists', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it('restores collapsed state from localStorage', () => {
    localStorageMock.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(true);
  });

  it('toggles collapsed when the returned toggle is called and persists to localStorage', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'true');

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'false');
  });

  it('falls back to expanded when localStorage throws (e.g. quota exceeded)', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it('toggles on Ctrl+\\ keydown', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '\\', ctrlKey: true }),
      );
    });
    expect(result.current[0]).toBe(true);
  });

  it('does not toggle on Ctrl+\\ when other modifier combinations are used', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => {
      // Ctrl+Shift+\ should NOT toggle
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, shiftKey: true }),
      );
    });
    expect(result.current[0]).toBe(false);
  });
});
