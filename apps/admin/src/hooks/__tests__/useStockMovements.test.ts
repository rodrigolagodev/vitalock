import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Flat stock_movements chain: select → eq → order (terminal)
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockMovementsSelect = vi.fn();
const mockFrom = vi.fn();

// Batch lookup chains per schema: select → in (terminal)
const mockStaffIn = vi.fn();
const mockStaffSelect = vi.fn();
const mockTicketIn = vi.fn();
const mockTicketSelect = vi.fn();
const mockSchemaFrom = vi.fn();
const mockSchema = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom, schema: mockSchema };
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

import { useStockMovements } from '../useStockMovements';

const flatMovements = [
  {
    id: 'm-1',
    product_id: 'p-1',
    type: 'compra',
    quantity: 5,
    unit_cost: 1200,
    note: null,
    order_id: null,
    order_item_id: null,
    ticket_id: 't-1',
    staff_id: null,
    created_by: 's-1',
    created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 'm-2',
    product_id: 'p-1',
    type: 'reserva',
    quantity: 1,
    unit_cost: null,
    note: null,
    order_id: 'o-1',
    order_item_id: 'oi-1',
    ticket_id: 't-1',
    staff_id: null,
    created_by: 's-2',
    created_at: '2026-08-01T09:00:00Z',
  },
];

const staffRows = [
  { id: 's-1', full_name: 'García Juan' },
  { id: 's-2', full_name: 'Pérez Ana' },
];

const ticketRows = [{ id: 't-1', ticket_number: 'TK-1001' }];

describe('useStockMovements', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: flatMovements, error: null });
    mockEq.mockReturnValue({ order: mockOrder });
    mockMovementsSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockMovementsSelect });

    mockStaffIn.mockResolvedValue({ data: staffRows, error: null });
    mockStaffSelect.mockReturnValue({ in: mockStaffIn });
    mockTicketIn.mockResolvedValue({ data: ticketRows, error: null });
    mockTicketSelect.mockReturnValue({ in: mockTicketIn });
    mockSchema.mockReturnValue({ from: mockSchemaFrom });
    mockSchemaFrom.mockImplementation((table: string) =>
      table === 'staff' ? { select: mockStaffSelect } : { select: mockTicketSelect },
    );
  });

  it('selects flat movements (no foreign_key embeds) for the product', async () => {
    const { result } = renderHook(() => useStockMovements('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('stock_movements');
    expect(mockMovementsSelect).toHaveBeenCalledWith(
      'id, product_id, type, quantity, unit_cost, note, order_id, order_item_id, order_kind, ticket_id, staff_id, created_by, created_at',
    );
    expect(mockEq).toHaveBeenCalledWith('product_id', 'p-1');
  });

  it('orders movements newest-first by created_at', async () => {
    const { result } = renderHook(() => useStockMovements('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('batch-resolves created_by staff ids via identity.staff and merges staff_name', async () => {
    const { result } = renderHook(() => useStockMovements('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSchema).toHaveBeenCalledWith('identity');
    expect(mockSchemaFrom).toHaveBeenCalledWith('staff');
    expect(mockStaffSelect).toHaveBeenCalledWith('id, full_name');
    expect(mockStaffIn).toHaveBeenCalledWith('id', ['s-1', 's-2']);

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: 'm-1', staff_name: 'García Juan' }),
      expect.objectContaining({ id: 'm-2', staff_name: 'Pérez Ana' }),
    ]);
  });

  it('batch-resolves ticket ids via support.tickets and merges ticket_number', async () => {
    const { result } = renderHook(() => useStockMovements('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSchema).toHaveBeenCalledWith('support');
    expect(mockSchemaFrom).toHaveBeenCalledWith('tickets');
    expect(mockTicketSelect).toHaveBeenCalledWith('id, ticket_number');
    expect(mockTicketIn).toHaveBeenCalledWith('id', ['t-1']);

    expect(result.current.data![0]!.ticket_number).toBe('TK-1001');
  });

  it('dedupes repeated ids before the batch in() calls', async () => {
    const dupMovements = [
      { ...flatMovements[0], created_by: 's-1' },
      { ...flatMovements[1], created_by: 's-1', ticket_id: 't-1' },
    ];
    mockOrder.mockResolvedValueOnce({ data: dupMovements, error: null });

    const { result } = renderHook(() => useStockMovements('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockStaffIn).toHaveBeenCalledWith('id', ['s-1']);
    expect(mockTicketIn).toHaveBeenCalledWith('id', ['t-1']);
  });

  it('skips batch lookups entirely when there are zero ids to resolve', async () => {
    const noRefs = flatMovements.map((m) => ({
      ...m,
      created_by: null,
      ticket_id: null,
    }));
    mockOrder.mockResolvedValueOnce({ data: noRefs, error: null });

    const { result } = renderHook(() => useStockMovements('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSchema).not.toHaveBeenCalled();
    expect(mockSchemaFrom).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: 'm-1', staff_name: null, ticket_number: null }),
      expect.objectContaining({ id: 'm-2', staff_name: null, ticket_number: null }),
    ]);
  });

  it('is disabled (query not executed) when productId is empty', async () => {
    const { result } = renderHook(() => useStockMovements(undefined), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(mockFrom).not.toHaveBeenCalled());

    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
