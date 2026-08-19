import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/hooks/mapMutationError';

// ─── Supabase mock: per-table routing ────────────────────────────────────────

const mockRpc = vi.fn();

// all_orders VIEW lookup (used by cancelOrden, confirmOrden, updateDraftOrden, markOrderInvoiced)
const mockAllOrdersSingle = vi.fn();
const mockAllOrdersEq = vi.fn().mockReturnValue({ single: mockAllOrdersSingle });
const mockAllOrdersSelect = vi.fn().mockReturnValue({ eq: mockAllOrdersEq });

// key_orders direct UPDATE (used by setKeyOrderPickupPerson)
const mockKeyOrdersEq = vi.fn();
const mockKeyOrdersUpdate = vi.fn().mockReturnValue({ eq: mockKeyOrdersEq });

// Route from() calls by table name
const mockFrom = vi.fn();

const mockSupabase = { from: mockFrom, rpc: mockRpc };

vi.mock('@/lib/supabase', () => ({ get supabase() { return mockSupabase; } }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

import { useMutateOrden } from '../useMutateOrden';

const sampleOrder = {
  order_type: 'keys' as const,
  client_type: 'administration' as const,
  administration_id: 'adm-1',
};
const sampleItems = [
  { item_type: 'key' as const, quantity: 1, building_id: 'b-1', unit_price: 100 },
];

describe('useMutateOrden', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: order resolves as 'key' kind
    mockAllOrdersSingle.mockResolvedValue({ data: { order_kind: 'key' }, error: null });
    mockAllOrdersEq.mockReturnValue({ single: mockAllOrdersSingle });
    mockAllOrdersSelect.mockReturnValue({ eq: mockAllOrdersEq });

    mockKeyOrdersEq.mockResolvedValue({ error: null });
    mockKeyOrdersUpdate.mockReturnValue({ eq: mockKeyOrdersEq });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'all_orders') return { select: mockAllOrdersSelect };
      if (table === 'key_orders') return { update: mockKeyOrdersUpdate };
      return { update: mockKeyOrdersUpdate };
    });
  });

  // createOrden — routes to create_key_order_with_items for keys
  it('createOrden calls supabase.rpc("create_key_order_with_items") with p_order + p_items', async () => {
    const newOrderId = 'new-uuid-1';
    mockRpc.mockResolvedValueOnce({ data: newOrderId, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createOrden.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('create_key_order_with_items', expect.objectContaining({
      p_order: expect.objectContaining({ client_type: 'administration' }),
      p_items: sampleItems,
    }));
  });

  it('createOrden success → shows success toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'uuid-1', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createOrden.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    await waitFor(() => expect(result.current.createOrden.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden creada correctamente.');
  });

  it('createOrden success → invalidates ordensKey prefix', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'uuid-2', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createOrden.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    await waitFor(() => expect(result.current.createOrden.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'ordenes']) }),
    );
  });

  it('createOrden forwards particular_id inside p_order when present', async () => {
    const newOrderId = 'new-uuid-2';
    mockRpc.mockResolvedValueOnce({ data: newOrderId, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createOrden.mutateAsync({
        order: {
          order_type: 'keys',
          client_type: 'particular',
          particular_id: 'part-1',
          particular_full_name: 'García Juan',
        },
        items: sampleItems,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('create_key_order_with_items', expect.objectContaining({
      p_order: expect.objectContaining({
        client_type: 'particular',
        particular_id: 'part-1',
        particular_full_name: 'García Juan',
      }),
    }));
  });

  it('createOrden error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'KEY_ORDER_EMPTY: at least one item required' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.createOrden.mutateAsync({
          order: sampleOrder,
          items: sampleItems,
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.createOrden.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // cancelOrden — looks up order_kind then routes to cancel_key_order
  it('cancelOrden fetches order_kind from all_orders then calls rpc("cancel_key_order")', async () => {
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'key' }, error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrden.mutateAsync({ id: 'order-abc' });
    });

    expect(mockFrom).toHaveBeenCalledWith('all_orders');
    expect(mockAllOrdersEq).toHaveBeenCalledWith('id', 'order-abc');
    expect(mockRpc).toHaveBeenCalledWith('cancel_key_order', { p_order_id: 'order-abc' });
  });

  it('cancelOrden success → shows cancel toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrden.mutateAsync({ id: 'order-abc' });
    });

    await waitFor(() => expect(result.current.cancelOrden.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden cancelada.');
  });

  // T-12: advanceOrdenStatus MUST NOT be exported from useMutateOrden
  it('advanceOrdenStatus is NOT present in the useMutateOrden return value', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });
    expect('advanceOrdenStatus' in result.current).toBe(false);
  });

  // confirmOrden — looks up order_kind then routes to confirm_key_order
  it('confirmOrden fetches order_kind from all_orders then calls rpc("confirm_key_order")', async () => {
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'key' }, error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmOrden.mutateAsync({ id: 'order-draft-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('confirm_key_order', { p_order_id: 'order-draft-1' });
  });

  it('confirmOrden success → shows "Orden confirmada" toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmOrden.mutateAsync({ id: 'order-draft-1' });
    });

    await waitFor(() => expect(result.current.confirmOrden.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden confirmada.');
  });

  it('confirmOrden success → invalidates ordensKey() and ordenKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmOrden.mutateAsync({ id: 'order-draft-1' });
    });

    await waitFor(() => expect(result.current.confirmOrden.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'ordenes']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'orden', 'order-draft-1'],
    });
  });

  it('confirmOrden error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'KEY_ORDER_NOT_DRAFT: order is not in draft status' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.confirmOrden.mutateAsync({ id: 'order-confirmed-1' });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.confirmOrden.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // updateDraftOrden — looks up order_kind then routes to update_draft_key_order_with_items
  it('updateDraftOrden calls rpc("update_draft_key_order_with_items") with correct args', async () => {
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'key' }, error: null });
    const newUpdatedAt = '2026-08-11T20:00:00.000Z';
    mockRpc.mockResolvedValueOnce({ data: newUpdatedAt, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    const patch = { notes: 'updated notes' };
    const items = [
      { id: 'item-1', item_type: 'key' as const, quantity: 2, building_id: 'b-1', unit_price: 50 },
    ];
    const expectedUpdatedAt = '2026-08-11T19:00:00.000Z';

    await act(async () => {
      await result.current.updateDraftOrden.mutateAsync({
        id: 'order-draft-2',
        order: patch,
        items,
        expectedUpdatedAt,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('update_draft_key_order_with_items', expect.objectContaining({
      p_order_id: 'order-draft-2',
      p_expected_updated_at: expectedUpdatedAt,
    }));
  });

  it('updateDraftOrden success → shows "Cambios guardados" toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-08-11T20:00:00.000Z', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateDraftOrden.mutateAsync({
        id: 'order-draft-2',
        order: { notes: 'x' },
        items: [],
        expectedUpdatedAt: '2026-08-11T19:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.updateDraftOrden.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Cambios guardados.');
  });

  it('updateDraftOrden success → invalidates ordensKey() and ordenKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-08-11T20:00:00.000Z', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateDraftOrden.mutateAsync({
        id: 'order-draft-2',
        order: {},
        items: [],
        expectedUpdatedAt: '2026-08-11T19:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.updateDraftOrden.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'ordenes']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'orden', 'order-draft-2'],
    });
  });

  it('updateDraftOrden optimistic concurrency error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'KEY_ORDER_STALE: order was modified concurrently' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateDraftOrden.mutateAsync({
          id: 'order-draft-2',
          order: {},
          items: [],
          expectedUpdatedAt: '2026-08-11T18:00:00.000Z',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.updateDraftOrden.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // setPickupPerson — routes to setKeyOrderPickupPerson (key_orders direct UPDATE)
  it('setPickupPerson calls UPDATE on key_orders with pickup_particular_id and filters by id', async () => {
    mockKeyOrdersEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setPickupPerson.mutateAsync({
        id: 'order-abc',
        pickup_particular_id: 'part-2',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('key_orders');
    expect(mockKeyOrdersUpdate).toHaveBeenCalledWith({ pickup_particular_id: 'part-2' });
    expect(mockKeyOrdersEq).toHaveBeenCalledWith('id', 'order-abc');
  });

  it('setPickupPerson success → shows pickup person toast', async () => {
    mockKeyOrdersEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setPickupPerson.mutateAsync({
        id: 'order-abc',
        pickup_particular_id: 'part-2',
      });
    });

    await waitFor(() => expect(result.current.setPickupPerson.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Persona de retiro actualizada.');
  });

  it('setPickupPerson success → invalidates the order detail and the ordens list', async () => {
    mockKeyOrdersEq.mockResolvedValueOnce({ error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setPickupPerson.mutateAsync({
        id: 'order-abc',
        pickup_particular_id: 'part-2',
      });
    });

    await waitFor(() => expect(result.current.setPickupPerson.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'orden', 'order-abc'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'ordenes', 'all', '', 'all'],
    });
  });

  it('setPickupPerson error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'pickup: order not found' };
    mockKeyOrdersEq.mockResolvedValueOnce({ error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.setPickupPerson.mutateAsync({
          id: 'order-abc',
          pickup_particular_id: 'part-2',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.setPickupPerson.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });
});
