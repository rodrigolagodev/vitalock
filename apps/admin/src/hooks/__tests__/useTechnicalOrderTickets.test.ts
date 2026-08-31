import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ============================================================
// Chainable supabase mock — single-query path:
//   supabase.schema('support').from('technical_order_tickets')
//     .select(...).eq('technical_order_id', orderId).order(...)
// ============================================================
const mockOrder = vi.fn();
const mockEq = vi.fn();
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useTechnicalOrderTickets } from '../useTechnicalOrderTickets';

const fakeTickets = [
  {
    id: 'tkt-1',
    ticket_number: 'TKT-001',
    category: 'maintenance',
    status: 'open',
    description: 'First ticket',
    technical_order_item_id: 'item-1',
    assigned_to_staff_id: null,
    created_at: '2026-08-10T10:00:00Z',
    resolved_at: null,
    technical_order_id: 'order-1',
  },
  {
    id: 'tkt-2',
    ticket_number: 'TKT-002',
    category: 'installation',
    status: 'resolved',
    description: 'Second ticket',
    technical_order_item_id: 'item-2',
    assigned_to_staff_id: 'staff-99',
    created_at: '2026-08-11T10:00:00Z',
    resolved_at: '2026-08-12T08:00:00Z',
    technical_order_id: 'order-1',
  },
];

describe('useTechnicalOrderTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain: schema → from → select → eq → order → resolves data
    mockOrder.mockResolvedValue({ data: fakeTickets, error: null });
    mockEq.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  // ============================================================
  // Case 1: valid orderId → exactly ONE call via schema('support')
  //         targeting 'technical_order_tickets' filtered by eq('technical_order_id', orderId)
  // ============================================================
  it('issues a single query via support.technical_order_tickets when orderId is provided', async () => {
    const { result } = renderHook(() => useTechnicalOrderTickets('order-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Exactly one schema call — no supabase.from() for technical_order_items
    expect(mockSchema).toHaveBeenCalledTimes(1);
    expect(mockSchema).toHaveBeenCalledWith('support');
    expect(mockFrom).toHaveBeenCalledWith('technical_order_tickets');
    expect(mockEq).toHaveBeenCalledWith('technical_order_id', 'order-1');
    expect(result.current.data).toHaveLength(2);
  });

  // ============================================================
  // Case 2: undefined orderId → no query issued, hook idle
  // ============================================================
  it('is disabled and issues no query when orderId is undefined', () => {
    const { result } = renderHook(() => useTechnicalOrderTickets(undefined), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockSchema).not.toHaveBeenCalled();
  });

  // ============================================================
  // Case 3: Supabase error → hook throws (query status = error)
  // ============================================================
  it('throws when Supabase returns an error', async () => {
    const supabaseError = { message: 'permission denied', code: '42501' };
    mockOrder.mockResolvedValue({ data: null, error: supabaseError });

    const { result } = renderHook(() => useTechnicalOrderTickets('order-err'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(supabaseError);
  });

  // ============================================================
  // Bonus: query key is namespaced under technical-orders
  // ============================================================
  it('registers query under the correct query key namespace', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useTechnicalOrderTickets('order-2'), { wrapper: Wrapper });

    const queries = queryClient.getQueryCache().findAll({
      queryKey: ['admin', 'technical-orders', 'order-2', 'tickets'],
    });
    expect(queries.length).toBeGreaterThan(0);
  });
});
