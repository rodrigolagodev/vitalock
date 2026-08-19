import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock
const mockSingle = vi.fn();
const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useKeyOrder } from '../useKeyOrder';
import { keyOrderKey } from '@/lib/queryKeys';

const fakeKeyOrder = {
  id: 'ko-1',
  order_number: 'ORD-LLV-000001',
  client_type: 'administration',
  administration_id: 'adm-1',
  administrations: { company_name: 'Garcia S.A.' },
  particular_id: null,
  particular_full_name: null,
  particular_dni: null,
  particular_phone: null,
  particular_email: null,
  pickup_particular_id: null,
  status: 'draft',
  notes: null,
  created_at: '2026-08-10T10:00:00Z',
  updated_at: '2026-08-10T10:00:00Z',
  key_order_items: [],
};

describe('useKeyOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSingle.mockResolvedValue({ data: fakeKeyOrder, error: null });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('uses keyOrderKey with the given id', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useKeyOrder('ko-1'), { wrapper: Wrapper });

    const key = keyOrderKey('ko-1');
    expect(key).toEqual(['admin', 'key-order', 'ko-1']);
  });

  it('queries from key_orders table by id', async () => {
    const { result } = renderHook(() => useKeyOrder('ko-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('key_orders');
    expect(mockEq).toHaveBeenCalledWith('id', 'ko-1');
  });

  it('returns the key order detail row on success', async () => {
    const { result } = renderHook(() => useKeyOrder('ko-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeKeyOrder);
  });

  it('is disabled (no fetch) when id is undefined', () => {
    const { result } = renderHook(() => useKeyOrder(undefined), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled (no fetch) when id is empty string', () => {
    const { result } = renderHook(() => useKeyOrder(''), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useKeyOrder('ko-err'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
