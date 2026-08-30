import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock (from → select → [eq?] → [or?] → order)
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

import { useTechnicalOrders } from '../useTechnicalOrders';
import { technicalOrdersKey } from '@/lib/queryKeys';

const fakeSummaryRows = [
  {
    id: 'to-1',
    order_number: 'ORD-TEC-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    company_name: 'Garcia S.A.',
    particular_full_name: null,
    status: 'draft',
    created_at: '2026-08-10T10:00:00Z',
    technical_order_items: [{ id: 'toi-1' }],
  },
];

describe('useTechnicalOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: fakeSummaryRows, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ eq: mockEq, or: mockOr, order: mockOrder });
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('default call uses technicalOrdersKey with all+empty string', () => {
    const { result } = renderHook(() => useTechnicalOrders(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = technicalOrdersKey();
    expect(key).toEqual(['admin', 'technical-orders', 'all', '', 'all', 'all']);
  });

  it('queries from technical_orders_summary view (single round trip)', async () => {
    const { result } = renderHook(() => useTechnicalOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('technical_orders_summary');
  });

  it('reshapes flat company_name into nested administrations for consumer compat', async () => {
    const { result } = renderHook(() => useTechnicalOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'to-1',
        administrations: { company_name: 'Garcia S.A.' },
        technical_order_items: [{ id: 'toi-1' }],
      }),
    ]);
  });

  it('no .or() filter called when no search term', async () => {
    const { result } = renderHook(() => useTechnicalOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('status filter calls .eq("status", value)', async () => {
    const { result } = renderHook(() => useTechnicalOrders({ status: 'confirmed' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'confirmed');
  });

  it('status="all" does not call .eq()', async () => {
    const { result } = renderHook(() => useTechnicalOrders({ status: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('buildingId filter uses embed inner-join on technical_order_items (no pre-query)', async () => {
    const { result } = renderHook(() => useTechnicalOrders({ buildingId: 'bld-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith('technical_order_items.building_id', 'bld-1');
    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining('technical_order_items!inner(id,building_id)'),
    );
  });

  it('search fires .or() with ilike on order_number + particular_full_name + company_name', async () => {
    const { result } = renderHook(() => useTechnicalOrders({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%garcia%,particular_full_name.ilike.%garcia%,company_name.ilike.%garcia%',
    );
  });

  it('search trims whitespace before building the ilike string', async () => {
    const { result } = renderHook(() => useTechnicalOrders({ search: '  ORD  ' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%ORD%,particular_full_name.ilike.%ORD%,company_name.ilike.%ORD%',
    );
  });

  it('empty search string does not fire .or()', async () => {
    const { result } = renderHook(() => useTechnicalOrders({ search: '' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('returns empty array when data is null (no records state)', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useTechnicalOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useTechnicalOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
