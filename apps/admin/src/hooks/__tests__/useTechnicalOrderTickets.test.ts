import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock — technical_order_items path
const mockInItems = vi.fn();
const mockEqItems = vi.fn().mockReturnValue({ data: null, error: null });
const mockSelectItems = vi.fn().mockReturnValue({ eq: mockEqItems });

// Chainable supabase mock — support.tickets path
const mockOrderTickets = vi.fn().mockReturnValue({ data: null, error: null });
const mockInTickets = vi.fn().mockReturnValue({ order: mockOrderTickets });
const mockSelectTickets = vi.fn().mockReturnValue({ in: mockInTickets });
const mockFromTickets = vi.fn().mockReturnValue({ select: mockSelectTickets });
const mockSchemaSupport = vi.fn().mockReturnValue({ from: mockFromTickets });

const mockFrom = vi.fn().mockReturnValue({ select: mockSelectItems });

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return {
      from: mockFrom,
      schema: mockSchemaSupport,
    };
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

describe('useTechnicalOrderTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: technical_order_items returns empty → should short-circuit to []
    mockEqItems.mockResolvedValue({ data: [], error: null });
    mockSelectItems.mockReturnValue({ eq: mockEqItems });
    mockFrom.mockReturnValue({ select: mockSelectItems });

    // Default: tickets chain
    mockOrderTickets.mockResolvedValue({ data: [], error: null });
    mockInTickets.mockReturnValue({ order: mockOrderTickets });
    mockSelectTickets.mockReturnValue({ in: mockInTickets });
    mockFromTickets.mockReturnValue({ select: mockSelectTickets });
    mockSchemaSupport.mockReturnValue({ from: mockFromTickets });
  });

  it('is disabled when orderId is undefined', () => {
    const { result } = renderHook(() => useTechnicalOrderTickets(undefined), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('uses query key namespaced under technical-orders', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useTechnicalOrderTickets('order-1'), { wrapper: Wrapper });

    // The query key must use the technical-orders namespace
    const queries = queryClient.getQueryCache().findAll({
      queryKey: ['admin', 'technical-orders', 'order-1', 'tickets'],
    });
    expect(queries.length).toBeGreaterThan(0);

    // Suppress unused warning
    void result;
  });

  it('returns empty array when no items exist for the order', async () => {
    mockEqItems.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTechnicalOrderTickets('order-no-items'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    // Must NOT have called support.tickets when items are empty
    expect(mockSchemaSupport).not.toHaveBeenCalled();
  });

  it('returns tickets ordered by created_at when items exist', async () => {
    const itemIds = ['item-1', 'item-2'];
    mockEqItems.mockResolvedValue({ data: itemIds.map((id) => ({ id })), error: null });

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
      },
    ];
    mockOrderTickets.mockResolvedValue({ data: fakeTickets, error: null });

    const { result } = renderHook(() => useTechnicalOrderTickets('order-with-items'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data).toHaveLength(2);
    const [first, second] = data;
    expect(first!.ticket_number).toBe('TKT-001');
    expect(second!.ticket_number).toBe('TKT-002');
    // Field must be technical_order_item_id (not the legacy order_item_id alias)
    expect(first!.technical_order_item_id).toBe('item-1');
    expect(second!.technical_order_item_id).toBe('item-2');
  });

  it('queries technical_order_items with the given orderId', async () => {
    mockEqItems.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTechnicalOrderTickets('order-abc'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('technical_order_items');
    expect(mockEqItems).toHaveBeenCalledWith('order_id', 'order-abc');

    // Suppress unused warning
    void result;
  });

  it('queries support schema tickets when items exist', async () => {
    mockEqItems.mockResolvedValue({ data: [{ id: 'item-x' }], error: null });
    mockOrderTickets.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTechnicalOrderTickets('order-xyz'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSchemaSupport).toHaveBeenCalledWith('support');
    expect(mockFromTickets).toHaveBeenCalledWith('tickets');
    expect(mockInTickets).toHaveBeenCalledWith('technical_order_item_id', ['item-x']);

    // Suppress unused warning
    void result;
  });
});
