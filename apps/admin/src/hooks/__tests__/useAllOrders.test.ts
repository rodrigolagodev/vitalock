import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockEq = vi.fn();
const mockIlike = vi.fn();
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

import { useAllOrders } from '../useAllOrders';
import { allOrdersKey } from '@/lib/queryKeys';

const fakeAllOrders = [
  {
    id: 'ao-1',
    order_number: 'ORD-LLV-000001',
    order_kind: 'key',
    client_type: 'administration',
    administration_id: 'adm-1',
    particular_id: null,
    particular_full_name: null,
    status: 'confirmed',
    notes: null,
    created_at: '2026-08-10T10:00:00Z',
    updated_at: '2026-08-10T10:05:00Z',
  },
  {
    id: 'ao-2',
    order_number: 'ORD-TEC-000001',
    order_kind: 'technical',
    client_type: 'particular',
    administration_id: null,
    particular_id: 'part-1',
    particular_full_name: 'Juan García',
    status: 'invoiced',
    notes: null,
    created_at: '2026-08-11T10:00:00Z',
    updated_at: '2026-08-11T10:05:00Z',
  },
];

describe('useAllOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy chain: from('all_orders') → select → [filters] → order → data
    mockOrder.mockResolvedValue({ data: fakeAllOrders, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockIlike.mockReturnValue({ order: mockOrder });
    // gte/lte are part of the chain — must return something that continues the chain
    const mockLteDefault = vi.fn().mockReturnValue({ order: mockOrder, or: mockOr });
    const mockGteDefault = vi.fn().mockReturnValue({ lte: mockLteDefault, order: mockOrder, or: mockOr });
    mockEq.mockReturnValue({ or: mockOr, order: mockOrder, ilike: mockIlike, gte: mockGteDefault, lte: mockLteDefault });
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder, ilike: mockIlike, gte: mockGteDefault, lte: mockLteDefault });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('allOrdersKey factory produces the expected shape', () => {
    expect(allOrdersKey()).toEqual(['admin', 'all-orders', 'all', '', 'all', '', '']);
    expect(allOrdersKey('invoiced', 'garcia', 'key')).toEqual([
      'admin', 'all-orders', 'invoiced', 'garcia', 'key', '', '',
    ]);
    expect(allOrdersKey('invoiced', 'garcia', 'key', '2026-08-01', '2026-08-31')).toEqual([
      'admin', 'all-orders', 'invoiced', 'garcia', 'key', '2026-08-01', '2026-08-31',
    ]);
  });

  it('queries from("all_orders") table', async () => {
    const { result } = renderHook(() => useAllOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('all_orders');
  });

  it('uses allOrdersKey as the query key', () => {
    const { result } = renderHook(() => useAllOrders(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = allOrdersKey();
    expect(key).toEqual(['admin', 'all-orders', 'all', '', 'all', '', '']);
  });

  it('returns data from all_orders on success (no filters)', async () => {
    const { result } = renderHook(() => useAllOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeAllOrders);
  });

  it('status filter calls .eq("status", value)', async () => {
    const { result } = renderHook(() => useAllOrders({ status: 'invoiced' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'invoiced');
  });

  it('status="all" does not call .eq() for status', async () => {
    const { result } = renderHook(() => useAllOrders({ status: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).not.toHaveBeenCalledWith('status', expect.anything());
  });

  it('orderKind filter calls .eq("order_kind", value)', async () => {
    const { result } = renderHook(() => useAllOrders({ orderKind: 'key' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('order_kind', 'key');
  });

  it('orderKind="all" does not call .eq() for order_kind', async () => {
    const { result } = renderHook(() => useAllOrders({ orderKind: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).not.toHaveBeenCalledWith('order_kind', expect.anything());
  });

  it('search param fires .or() with ilike on order_number + particular_full_name', async () => {
    const { result } = renderHook(() => useAllOrders({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%garcia%,particular_full_name.ilike.%garcia%',
    );
  });

  it('search trims whitespace', async () => {
    const { result } = renderHook(() => useAllOrders({ search: '  ORD  ' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%ORD%,particular_full_name.ilike.%ORD%',
    );
  });

  it('empty search does not fire .or()', async () => {
    const { result } = renderHook(() => useAllOrders({ search: '' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('returns empty array when data is null', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useAllOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useAllOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });

  describe('date-range filter', () => {
    let mockGte: ReturnType<typeof vi.fn>;
    let mockLte: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGte = vi.fn();
      mockLte = vi.fn();

      // Build a full chainable mock that supports gte/lte in any order
      const terminal = { order: mockOrder };
      mockLte.mockReturnValue(terminal);
      mockGte.mockReturnValue({ lte: mockLte, order: mockOrder });
      mockEq.mockReturnValue({ or: mockOr, order: mockOrder, ilike: mockIlike, gte: mockGte, lte: mockLte });
      mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder, ilike: mockIlike, gte: mockGte, lte: mockLte });
    });

    it('dateFrom alone calls .gte("created_at", dateFrom)', async () => {
      const { result } = renderHook(
        () => useAllOrders({ dateFrom: '2026-08-01' }),
        { wrapper: makeWrapper() },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGte).toHaveBeenCalledWith('created_at', '2026-08-01');
    });

    it('dateTo alone calls .lte("created_at", dateTo + T23:59:59.999Z)', async () => {
      mockGte.mockReturnValue({ lte: mockLte, order: mockOrder });
      mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder, ilike: mockIlike, gte: mockGte, lte: mockLte });
      const { result } = renderHook(
        () => useAllOrders({ dateTo: '2026-08-31' }),
        { wrapper: makeWrapper() },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockLte).toHaveBeenCalledWith('created_at', '2026-08-31T23:59:59.999Z');
    });

    it('dateFrom + dateTo both wired: calls .gte() then .lte()', async () => {
      const { result } = renderHook(
        () => useAllOrders({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }),
        { wrapper: makeWrapper() },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGte).toHaveBeenCalledWith('created_at', '2026-08-01');
      expect(mockLte).toHaveBeenCalledWith('created_at', '2026-08-31T23:59:59.999Z');
    });

    it('allOrdersKey includes dateFrom and dateTo when set', () => {
      const key = allOrdersKey('invoiced', 'garcia', 'key', '2026-08-01', '2026-08-31');
      expect(key).toEqual([
        'admin', 'all-orders', 'invoiced', 'garcia', 'key', '2026-08-01', '2026-08-31',
      ]);
    });

    it('allOrdersKey defaults dateFrom and dateTo to empty string', () => {
      const key = allOrdersKey();
      expect(key).toEqual(['admin', 'all-orders', 'all', '', 'all', '', '']);
    });
  });
});
