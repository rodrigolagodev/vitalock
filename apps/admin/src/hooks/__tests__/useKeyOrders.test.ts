import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock
const mockOrder = vi.fn();
const mockOr = vi.fn();
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useKeyOrders } from '../useKeyOrders';
import { keyOrdersKey } from '@/lib/queryKeys';

const fakeKeyOrders = [
  {
    id: 'ko-1',
    order_number: 'ORD-LLV-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Garcia S.A.' },
    particular_full_name: null,
    status: 'draft',
    created_at: '2026-08-10T10:00:00Z',
    key_order_items: [{ id: 'koi-1' }],
  },
];

describe('useKeyOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy chain: from → select → [eq?] → [or?] → order resolves with data
    mockOrder.mockResolvedValue({ data: fakeKeyOrders, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ or: mockOr, order: mockOrder });
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('default call uses keyOrdersKey with all+empty string', () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = keyOrdersKey();
    expect(key).toEqual(['admin', 'key-orders', 'all', '', 'all', 'all']);
  });

  it('queries from key_orders table', async () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('key_orders');
  });

  it('returns data on success (no filters)', async () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeKeyOrders);
  });

  it('no .or() filter called when no search term', async () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('status filter calls .eq("status", value)', async () => {
    const { result } = renderHook(() => useKeyOrders({ status: 'draft' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'draft');
  });

  it('status="all" does not call .eq()', async () => {
    const { result } = renderHook(() => useKeyOrders({ status: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('search param fires .or() with ilike on order_number + particular_full_name', async () => {
    const { result } = renderHook(() => useKeyOrders({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%garcia%,particular_full_name.ilike.%garcia%',
    );
  });

  it('search trims whitespace before building the ilike string', async () => {
    const { result } = renderHook(() => useKeyOrders({ search: '  ORD  ' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%ORD%,particular_full_name.ilike.%ORD%',
    );
  });

  it('empty search string does not fire .or()', async () => {
    const { result } = renderHook(() => useKeyOrders({ search: '' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('returns empty array when data is null (no records state)', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
