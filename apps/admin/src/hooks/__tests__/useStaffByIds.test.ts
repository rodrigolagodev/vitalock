import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSchema = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { schema: mockSchema };
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

import { useStaffByIds } from '../useStaffByIds';

describe('useStaffByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIn.mockResolvedValue({
      data: [
        { id: 's-1', full_name: 'Garcia, Juan' },
        { id: 's-2', full_name: 'Perez, Ana' },
      ],
      error: null,
    });
    mockSelect.mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('is disabled when ids is empty', () => {
    const { result } = renderHook(() => useStaffByIds([]), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('fetches from identity.staff by ids and returns Map', async () => {
    const { result } = renderHook(() => useStaffByIds(['s-1', 's-2']), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSchema).toHaveBeenCalledWith('identity');
    expect(mockFrom).toHaveBeenCalledWith('staff');
    expect(mockSelect).toHaveBeenCalledWith('id, full_name');
    expect(mockIn).toHaveBeenCalledWith('id', ['s-1', 's-2']);
    expect(result.current.data?.get('s-1')?.full_name).toBe('Garcia, Juan');
    expect(result.current.data?.get('s-2')?.full_name).toBe('Perez, Ana');
  });

  it('deduplicates repeated ids', async () => {
    const { result } = renderHook(
      () => useStaffByIds(['s-1', 's-1', 's-2']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, ids] = mockIn.mock.calls[0] as [string, string[]];
    expect(ids.sort()).toEqual(['s-1', 's-2']);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockIn.mockResolvedValueOnce({ data: null, error: dbError });
    const { result } = renderHook(() => useStaffByIds(['s-1']), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
