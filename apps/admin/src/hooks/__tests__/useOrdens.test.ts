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

import { useOrdens } from '../useOrdens';
import { ordensKey } from '@/lib/queryKeys';

// Raw rows returned by the all_orders VIEW (include order_kind).
const fakeViewRows = [
  {
    id: 'o-1',
    order_number: 'ORD-LLV-000001',
    order_kind: 'key',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Garcia S.A.' },
    particular_full_name: null,
    status: 'draft',
    created_at: '2026-08-10T10:00:00Z',
  },
];

// Expected OrdenRow shape after the hook maps order_kind → order_type and adds order_items: [].
const fakeOrdens = fakeViewRows.map((r) => ({
  ...r,
  order_type: r.order_kind === 'key' ? 'keys' : 'technical',
  order_items: [],
}));

describe('useOrdens', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy chain: from → select → [eq?] → [or?] → order resolves with data
    // The mock returns raw VIEW rows (with order_kind); the hook maps to order_type.
    mockOrder.mockResolvedValue({ data: fakeViewRows, error: null });
    // or returns something with order
    mockOr.mockReturnValue({ order: mockOrder });
    // eq returns something with or and order
    mockEq.mockReturnValue({ or: mockOr, order: mockOrder });
    // select returns the full chain (all intermediate methods)
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('queries from("all_orders") VIEW instead of orders table', async () => {
    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('all_orders');
  });

  it('default call uses ordensKey with all+empty string', () => {
    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = ordensKey();
    expect(key).toEqual(['admin', 'ordenes', 'all', '', 'all']);
  });

  it('returns data on success (no filters)', async () => {
    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeOrdens);
  });

  it('no .or() filter called when no search term', async () => {
    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('status filter calls .eq("status", value)', async () => {
    const { result } = renderHook(() => useOrdens({ status: 'draft' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'draft');
  });

  it('status="all" does not call .eq()', async () => {
    const { result } = renderHook(() => useOrdens({ status: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('search param fires .or() with ilike on order_number + particular_full_name', async () => {
    const { result } = renderHook(() => useOrdens({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%garcia%,particular_full_name.ilike.%garcia%',
    );
  });

  it('search trims whitespace before building the ilike string', async () => {
    const { result } = renderHook(() => useOrdens({ search: '  ORD  ' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%ORD%,particular_full_name.ilike.%ORD%',
    );
  });

  it('empty search string does not fire .or()', async () => {
    const { result } = renderHook(() => useOrdens({ search: '' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('returns empty array when data is null (no records state)', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns empty array when data is empty (no-records empty state)', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('search + administration filter: particular rows pass through (server already ilike-filtered)', async () => {
    const mixedData = [
      { ...fakeViewRows[0], administrations: { company_name: 'Garcia S.A.' } },
      {
        id: 'o-2',
        order_number: 'ORD-LLV-000002',
        order_kind: 'key',
        client_type: 'particular',
        administration_id: null,
        administrations: null,
        particular_full_name: 'garcia martin',
        status: 'draft',
        created_at: '2026-08-10T11:00:00Z',
      },
    ];
    mockOrder.mockResolvedValueOnce({ data: mixedData, error: null });

    const { result } = renderHook(() => useOrdens({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Both rows match: administration via company_name, particular via server ilike
    expect(result.current.data).toHaveLength(2);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useOrdens(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
