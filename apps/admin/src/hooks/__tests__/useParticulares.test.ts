import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock: from → select → (or?) → order
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

import { useParticulares } from '../useParticulares';

const fakeParticulares = [
  {
    id: 'p-1',
    unit_id: 'u-1',
    dni: '30111222',
    full_name: 'García Juan',
    phone: null,
    email: null,
  },
];

describe('useParticulares', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: fakeParticulares, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ or: mockOr, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('default call (no search) returns data without .or() filter', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useParticulares(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeParticulares);
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('search forwards .or() with combined full_name/dni ILIKE string', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useParticulares({ search: 'garcia' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOr).toHaveBeenCalledWith(
      'full_name.ilike.%garcia%,dni.ilike.%garcia%',
    );
  });

  it('search by DNI forwards the same combined filter', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useParticulares({ search: '30111222' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOr).toHaveBeenCalledWith(
      'full_name.ilike.%30111222%,dni.ilike.%30111222%',
    );
  });

  it('query key uses particularesKey shape with the debounced search', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useParticulares({ search: 'garcia' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(['admin', 'particulares', 'garcia']);
  });

  it('debounces the search: no .or() until the delay elapses', async () => {
    vi.useFakeTimers();
    try {
      const { Wrapper } = makeWrapper();
      const { rerender } = renderHook(
        ({ search }: { search?: string }) => useParticulares({ search }),
        { initialProps: { search: '' }, wrapper: Wrapper },
      );

      // initial query (empty search) resolves without .or()
      await act(async () => {});
      expect(mockOr).not.toHaveBeenCalled();

      rerender({ search: 'garcia' });

      // within the debounce window nothing fires
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(mockOr).not.toHaveBeenCalled();

      // after the full delay the query fires with the debounced search
      act(() => {
        vi.advanceTimersByTime(1);
      });
      await act(async () => {});
      expect(mockOr).toHaveBeenCalledWith(
        'full_name.ilike.%garcia%,dni.ilike.%garcia%',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
