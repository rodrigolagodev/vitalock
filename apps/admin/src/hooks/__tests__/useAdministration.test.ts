import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();
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

import { useAdministration } from '../useAdministration';

const fakeAdmin = {
  id: 'a-1',
  company_name: 'Garcia S.A.',
  tax_id: '30-71234567-9',
  address: 'Av. Corrientes 1234',
  status: 'active',
};

describe('useAdministration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockMaybeSingle.mockResolvedValue({ data: fakeAdmin, error: null });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('fetches a single administration by id', async () => {
    const { result } = renderHook(() => useAdministration('a-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeAdmin);
    expect(mockFrom).toHaveBeenCalledWith('administrations');
    expect(mockEq).toHaveBeenCalledWith('id', 'a-1');
  });

  it('returns null when the record is not found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() => useAdministration('missing-id'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('uses queryKey [admin, administration, id]', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = function ({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    };

    const { result } = renderHook(() => useAdministration('a-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The query should be cached under the correct key
    const cached = queryClient.getQueryData(['admin', 'administration', 'a-1']);
    expect(cached).toEqual(fakeAdmin);
  });

  it('is disabled when id is empty string', () => {
    const { result } = renderHook(() => useAdministration(''), {
      wrapper: makeWrapper(),
    });

    // With enabled: false (empty id), query stays pending/idle — never fires
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
