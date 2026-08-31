import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock — defined at module scope so the getter can reference
// them without hitting the TDZ. vi.fn() is safe to call before vi.mock hoisting
// because vitest lazily evaluates the factory.
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

// The supabase mock must be defined before useKeyOrders is imported, because
// the hook is now a module-level constant that captures `supabase` at init.
vi.mock('@/lib/supabase', () => {
  const order = vi.fn();
  const or = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();
  return {
    get supabase() {
      return { from };
    },
    // expose handles so beforeEach can rewire them
    _mocks: { order, or, eq, select, from },
  };
});

// Import AFTER vi.mock declaration (vi.mock is hoisted, but the import
// resolution happens after the mock factory above runs).
import { useKeyOrders } from '../useKeyOrders';
import { keyOrdersKey } from '@/lib/queryKeys';
// Access the shared mock handles via the mock module
import * as supabaseMock from '@/lib/supabase';

// Helper to get the internal mock handles
function getMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabaseMock as any)._mocks as {
    order: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// View-shaped raw rows (as returned by supabase.from('key_orders_summary'))
const fakeSummaryRows = [
  {
    id: 'ko-1',
    order_number: 'ORD-LLV-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    company_name: 'Garcia S.A.',
    particular_full_name: null,
    status: 'draft',
    created_at: '2026-08-10T10:00:00Z',
    key_order_items: [{ id: 'koi-1' }],
  },
];

describe('useKeyOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const m = getMocks();

    m.order.mockResolvedValue({ data: fakeSummaryRows, error: null });
    m.or.mockReturnValue({ order: m.order });
    m.eq.mockReturnValue({ eq: m.eq, or: m.or, order: m.order });
    m.select.mockReturnValue({ or: m.or, eq: m.eq, order: m.order });
    m.from.mockReturnValue({ select: m.select });

    // Sync outer handles for assertions
    mockOrder.mockImplementation(m.order);
    mockOr.mockImplementation(m.or);
    mockEq.mockImplementation(m.eq);
    mockSelect.mockImplementation(m.select);
    mockFrom.mockImplementation(m.from);
  });

  it('default call uses keyOrdersKey with all+empty string', () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = keyOrdersKey();
    expect(key).toEqual(['admin', 'key-orders', 'all', '', 'all', 'all']);
  });

  it('queries from key_orders_summary view (single round trip)', async () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().from).toHaveBeenCalledTimes(1);
    expect(getMocks().from).toHaveBeenCalledWith('key_orders_summary');
  });

  it('reshapes flat company_name into nested administrations for consumer compat', async () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'ko-1',
        administrations: { company_name: 'Garcia S.A.' },
        key_order_items: [{ id: 'koi-1' }],
      }),
    ]);
  });

  it('no .or() filter called when no search term', async () => {
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().or).not.toHaveBeenCalled();
  });

  it('status filter calls .eq("status", value)', async () => {
    const { result } = renderHook(() => useKeyOrders({ status: 'draft' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().eq).toHaveBeenCalledWith('status', 'draft');
  });

  it('status="all" does not call .eq()', async () => {
    const { result } = renderHook(() => useKeyOrders({ status: 'all' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().eq).not.toHaveBeenCalled();
  });

  it('buildingId filter uses embed inner-join on key_order_items (no pre-query)', async () => {
    const { result } = renderHook(() => useKeyOrders({ buildingId: 'bld-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Single from() call — no pre-query for order ids
    expect(getMocks().from).toHaveBeenCalledTimes(1);
    // Embed filter applied via .eq
    expect(getMocks().eq).toHaveBeenCalledWith('key_order_items.building_id', 'bld-1');
    // select clause carries the !inner hint
    expect(getMocks().select).toHaveBeenCalledWith(
      expect.stringContaining('key_order_items!inner(id,building_id)'),
    );
  });

  it('search fires .or() with ilike on order_number + particular_full_name + company_name', async () => {
    const { result } = renderHook(() => useKeyOrders({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().or).toHaveBeenCalledWith(
      'order_number.ilike.%garcia%,particular_full_name.ilike.%garcia%,company_name.ilike.%garcia%',
    );
  });

  it('search trims whitespace before building the ilike string', async () => {
    const { result } = renderHook(() => useKeyOrders({ search: '  ORD  ' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().or).toHaveBeenCalledWith(
      'order_number.ilike.%ORD%,particular_full_name.ilike.%ORD%,company_name.ilike.%ORD%',
    );
  });

  it('empty search string does not fire .or()', async () => {
    const { result } = renderHook(() => useKeyOrders({ search: '' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMocks().or).not.toHaveBeenCalled();
  });

  it('returns empty array when data is null (no records state)', async () => {
    getMocks().order.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    getMocks().order.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useKeyOrders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });

  // REQ-SHARED-ORDER-LIST-INVALIDATION-1.3 — queryKey shape snapshot lock
  it('keyOrdersKey shape is locked by inline snapshot', () => {
    expect(keyOrdersKey('draft', 'foo', 'admin-1', 'bld-1')).toMatchInlineSnapshot(`
      [
        "admin",
        "key-orders",
        "draft",
        "foo",
        "admin-1",
        "bld-1",
      ]
    `);
  });
});
