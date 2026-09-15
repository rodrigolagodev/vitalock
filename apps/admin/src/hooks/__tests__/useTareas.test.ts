import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock mirroring useAllOrders.test.ts's pattern — this
// hook is its own hand-rolled query builder (NOT the shared createUseOrderList
// factory), so it needs its own .eq→.in widening test coverage.
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockIn = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
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

import { useTareas } from '../useTareas';
import { tareasKey } from '@/lib/queryKeys';

const fakeTareas = [
  {
    id: 'tk-1',
    ticket_number: 'TCK-000001',
    category: 'install_equipment',
    description: 'Instalar cerradura',
    status: 'open',
    administration_id: null,
    building_id: 'bld-1',
    unit_id: null,
    equipment_id: null,
    assigned_to_staff_id: null,
    opened_by_staff_id: null,
    opened_at: '2026-08-10T10:00:00Z',
    updated_at: '2026-08-10T10:05:00Z',
    resolution_notes: null,
    cancellation_reason: null,
    notes: null,
  },
];

describe('useTareas', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Happy chain: from('tickets').select(...) → [filters] → order → data
    mockOrder.mockResolvedValue({ data: fakeTareas, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockIn.mockReturnValue({
      in: mockIn,
      eq: mockEq,
      or: mockOr,
      order: mockOrder,
    });
    mockEq.mockReturnValue({
      eq: mockEq,
      in: mockIn,
      or: mockOr,
      order: mockOrder,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
      in: mockIn,
      or: mockOr,
      order: mockOrder,
    });
    mockSchema.mockReturnValue({ from: mockFrom });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'buildings' || table === 'administrations' || table === 'staff') {
        return { select: () => ({ in: () => Promise.resolve({ data: [] }) }) };
      }
      return { select: mockSelect };
    });
  });

  it('tareasKey factory produces the expected shape', () => {
    expect(tareasKey()).toEqual(['admin', 'tareas', '', 'all', 'all', 'all']);
    expect(tareasKey('garcia', 'staff-1', 'bld-1', ['open'])).toEqual([
      'admin',
      'tareas',
      'garcia',
      'staff-1',
      'bld-1',
      'open',
    ]);
  });

  it('tareasKey normalizes multi-value status arrays order-insensitively', () => {
    expect(tareasKey('', undefined, undefined, ['open', 'in_progress'])).toEqual(
      tareasKey('', undefined, undefined, ['in_progress', 'open']),
    );
  });

  it('queries from("tickets") on the support schema', async () => {
    const { result } = renderHook(() => useTareas(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSchema).toHaveBeenCalledWith('support');
    expect(mockFrom).toHaveBeenCalledWith('tickets');
  });

  it('single status filter calls .in("status", value)', async () => {
    const { result } = renderHook(() => useTareas({ status: ['open'] }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIn).toHaveBeenCalledWith('status', ['open']);
    expect(mockEq).not.toHaveBeenCalledWith('status', expect.anything());
  });

  it('multiple statuses call .in("status", [...]) with every selected value', async () => {
    const { result } = renderHook(() => useTareas({ status: ['open', 'in_progress'] }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIn).toHaveBeenCalledWith('status', ['open', 'in_progress']);
  });

  it('empty status array does not call .in() for status', async () => {
    const { result } = renderHook(() => useTareas({ status: [] }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIn).not.toHaveBeenCalledWith('status', expect.anything());
  });

  it('undefined status does not call .in() for status', async () => {
    const { result } = renderHook(() => useTareas(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIn).not.toHaveBeenCalledWith('status', expect.anything());
  });

  it('staffId filter still calls .eq("assigned_to_staff_id", value) — unaffected by the array widening', async () => {
    const { result } = renderHook(() => useTareas({ staffId: 'staff-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('assigned_to_staff_id', 'staff-1');
  });

  it('returns data mapped from the raw ticket rows', async () => {
    const { result } = renderHook(() => useTareas(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe('tk-1');
    expect(result.current.data?.[0]?.status).toBe('open');
  });
});
