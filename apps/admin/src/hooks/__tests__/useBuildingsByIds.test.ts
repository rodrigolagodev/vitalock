import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useBuildingsByIds } from '../useBuildingsByIds';

describe('useBuildingsByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIn.mockResolvedValue({
      data: [
        { id: 'b-1', name: 'Edificio Uno' },
        { id: 'b-2', name: 'Edificio Dos' },
      ],
      error: null,
    });
    mockSelect.mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('is disabled when ids is empty', () => {
    const { result } = renderHook(() => useBuildingsByIds([]), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fetches by unique ids and returns a Map<id, {id, name}>', async () => {
    const { result } = renderHook(() => useBuildingsByIds(['b-1', 'b-2']), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('buildings');
    expect(mockSelect).toHaveBeenCalledWith('id, name');
    expect(mockIn).toHaveBeenCalledWith('id', ['b-1', 'b-2']);
    expect(result.current.data?.get('b-1')?.name).toBe('Edificio Uno');
    expect(result.current.data?.get('b-2')?.name).toBe('Edificio Dos');
  });

  it('deduplicates repeated ids and filters null/empty', async () => {
    const { result } = renderHook(
      () => useBuildingsByIds(['b-1', 'b-1', '', null as unknown as string, 'b-2']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, ids] = mockIn.mock.calls[0] as [string, string[]];
    expect(ids.sort()).toEqual(['b-1', 'b-2']);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockIn.mockResolvedValueOnce({ data: null, error: dbError });
    const { result } = renderHook(() => useBuildingsByIds(['b-1']), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
