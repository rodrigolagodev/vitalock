import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Chainable supabase mock
// from → select → [eq?]* → [or?] → order
// ---------------------------------------------------------------------------
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// Import AFTER mock setup
import { createUseOrderList } from '../createUseOrderList';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const mockQueryKeyFn = vi.fn(
  (status?: string, search?: string, administrationId?: string, buildingId?: string) =>
    ['test', 'orders', status ?? 'all', search ?? '', administrationId ?? 'all', buildingId ?? 'all'] as const,
);

const mockMapRow = vi.fn((row: { id: string; [key: string]: unknown }, _itemsField: string) => ({
  id: row.id,
  mapped: true,
}));

const fakeRawRows = [
  {
    id: 'order-1',
    order_number: 'ORD-001',
    client_type: 'administration' as const,
    administration_id: 'adm-1',
    company_name: 'ACME S.A.',
    particular_full_name: null,
    status: 'draft',
    created_at: '2026-08-10T10:00:00Z',
    test_order_items: [{ id: 'item-1' }],
  },
];

const mockSupabase = { from: mockFrom } as never;

// Factory options shared by most tests
function makeOptions() {
  return {
    view: 'test_orders_summary',
    itemsTable: 'test_order_items',
    queryKeyFn: mockQueryKeyFn,
    mapRow: mockMapRow,
    supabase: mockSupabase,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createUseOrderList (factory)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: fakeRawRows, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ eq: mockEq, or: mockOr, order: mockOrder });
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockMapRow.mockImplementation((row) => ({ id: (row as { id: string }).id, mapped: true }));
  });

  // -------------------------------------------------------------------------
  // B.2 test-1: filter → query translation (no filters)
  // -------------------------------------------------------------------------
  it('REQ-SHARED-ORDER-LIST-FACTORY-1.6: no filters → no .eq() or .or() calls', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('test_orders_summary');
    expect(mockEq).not.toHaveBeenCalled();
    expect(mockOr).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // B.2 test-2: status filter
  // -------------------------------------------------------------------------
  it('REQ-SHARED-ORDER-LIST-FACTORY-1.2: status filter applies .eq("status", value)', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ status: 'pending' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'pending');
  });

  it('status="all" does not call .eq()', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ status: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // B.2 test-3: administrationId filter
  // -------------------------------------------------------------------------
  it('REQ-SHARED-ORDER-LIST-FACTORY-1.3: administrationId filter applies .eq("administration_id", value)', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ administrationId: 'A1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('administration_id', 'A1');
  });

  // -------------------------------------------------------------------------
  // B.2 test-4: buildingId filter (inner embed, single query)
  // -------------------------------------------------------------------------
  it('REQ-SHARED-ORDER-LIST-FACTORY-1.4: buildingId filter uses !inner embed — single query', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ buildingId: 'B1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining('test_order_items!inner(id,building_id)'),
    );
    expect(mockEq).toHaveBeenCalledWith('test_order_items.building_id', 'B1');
  });

  // -------------------------------------------------------------------------
  // B.2 test-5: search ILIKE
  // -------------------------------------------------------------------------
  it('REQ-SHARED-ORDER-LIST-FACTORY-1.5: search applies .or() ILIKE across three columns', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%garcia%,particular_full_name.ilike.%garcia%,company_name.ilike.%garcia%',
    );
  });

  it('search trims whitespace before building ILIKE string', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ search: '  ORD  ' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%ORD%,particular_full_name.ilike.%ORD%,company_name.ilike.%ORD%',
    );
  });

  it('empty search string does not fire .or()', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook({ search: '' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // B.2 test-6: all-four filters combined
  // -------------------------------------------------------------------------
  it('all-four filters combined apply all corresponding calls', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(
      () => useHook({ search: 'sol', status: 'draft', administrationId: 'adm-1', buildingId: 'bld-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'draft');
    expect(mockEq).toHaveBeenCalledWith('administration_id', 'adm-1');
    expect(mockEq).toHaveBeenCalledWith('test_order_items.building_id', 'bld-1');
    expect(mockOr).toHaveBeenCalledWith(
      'order_number.ilike.%sol%,particular_full_name.ilike.%sol%,company_name.ilike.%sol%',
    );
  });

  // -------------------------------------------------------------------------
  // B.2 test-7: snapshot on queryKeyFn invocation (REQ-SHARED-ORDER-LIST-INVALIDATION-1)
  // -------------------------------------------------------------------------
  it('REQ-SHARED-ORDER-LIST-INVALIDATION-1: queryKeyFn is called with (status, trimmedSearch, administrationId, buildingId)', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(
      () => useHook({ status: 'draft', search: '  foo  ', administrationId: 'adm-1', buildingId: 'bld-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockQueryKeyFn).toHaveBeenCalledWith('draft', 'foo', 'adm-1', 'bld-1');
  });

  it('queryKeyFn is called with default values when no filters', async () => {
    const useHook = createUseOrderList(makeOptions());
    renderHook(() => useHook(), { wrapper: makeWrapper() });
    // queryKey registered — check the fn was called
    expect(mockQueryKeyFn).toHaveBeenCalledWith(undefined, '', undefined, undefined);
  });

  // -------------------------------------------------------------------------
  // B.2 test-8: mapRow called once per row with (row, itemsField)
  // -------------------------------------------------------------------------
  it('mapRow is called once per result row with (row, itemsField)', async () => {
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockMapRow).toHaveBeenCalledTimes(1);
    expect(mockMapRow).toHaveBeenCalledWith(fakeRawRows[0], 'test_order_items');
    expect(result.current.data).toEqual([{ id: 'order-1', mapped: true }]);
  });

  // -------------------------------------------------------------------------
  // B.2 test-9: empty result → mapRow never called
  // -------------------------------------------------------------------------
  it('empty result set → mapRow is never called', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockMapRow).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  it('null data → mapRow is never called and returns empty array', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockMapRow).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Error case
  // -------------------------------------------------------------------------
  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });
    const useHook = createUseOrderList(makeOptions());
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
