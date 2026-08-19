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

// Chainable supabase mock — supports both rpc() and from().update().eq()
const mockRpc = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
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

import { useMutateKeyOrder } from '../useMutateKeyOrder';

const sampleOrder = {
  client_type: 'administration' as const,
  administration_id: 'adm-1',
};
const sampleItems = [
  { item_type: 'key' as const, quantity: 1, building_id: 'b-1', unit_price: 100 },
];

describe('useMutateKeyOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createKeyOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('createKeyOrder calls rpc("create_key_order_with_items") with correct args', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ko-new-1', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createKeyOrder.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('create_key_order_with_items', {
      p_order: sampleOrder,
      p_items: sampleItems,
      p_confirm_immediately: true,
    });
  });

  it('createKeyOrder success → shows success toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ko-1', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createKeyOrder.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    await waitFor(() => expect(result.current.createKeyOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden de llave creada correctamente.');
  });

  it('createKeyOrder success → invalidates keyOrdersKey prefix', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ko-2', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createKeyOrder.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    await waitFor(() => expect(result.current.createKeyOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
  });

  it('createKeyOrder error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'KEY_ORDER_EMPTY: no items' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.createKeyOrder.mutateAsync({
          order: sampleOrder,
          items: sampleItems,
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.createKeyOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // confirmKeyOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('confirmKeyOrder calls rpc("confirm_key_order", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmKeyOrder.mutateAsync({ id: 'ko-draft-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('confirm_key_order', { p_order_id: 'ko-draft-1' });
  });

  it('confirmKeyOrder success → shows "Orden confirmada" toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmKeyOrder.mutateAsync({ id: 'ko-draft-1' });
    });

    await waitFor(() => expect(result.current.confirmKeyOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden confirmada.');
  });

  it('confirmKeyOrder success → invalidates keyOrdersKey() and keyOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmKeyOrder.mutateAsync({ id: 'ko-draft-1' });
    });

    await waitFor(() => expect(result.current.confirmKeyOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'key-order', 'ko-draft-1'],
    });
  });

  it('confirmKeyOrder error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'KEY_ORDER_NOT_DRAFT' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.confirmKeyOrder.mutateAsync({ id: 'ko-confirmed-1' });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.confirmKeyOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // cancelKeyOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('cancelKeyOrder calls rpc("cancel_key_order", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelKeyOrder.mutateAsync({ id: 'ko-abc' });
    });

    expect(mockRpc).toHaveBeenCalledWith('cancel_key_order', { p_order_id: 'ko-abc' });
  });

  it('cancelKeyOrder success → shows cancel toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelKeyOrder.mutateAsync({ id: 'ko-abc' });
    });

    await waitFor(() => expect(result.current.cancelKeyOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden cancelada.');
  });

  it('cancelKeyOrder success → invalidates keyOrdersKey() and keyOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelKeyOrder.mutateAsync({ id: 'ko-abc' });
    });

    await waitFor(() => expect(result.current.cancelKeyOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'key-order', 'ko-abc'],
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateDraftKeyOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('updateDraftKeyOrder calls rpc("update_draft_key_order_with_items") with correct args', async () => {
    const newUpdatedAt = '2026-08-11T20:00:00.000Z';
    mockRpc.mockResolvedValueOnce({ data: newUpdatedAt, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    const patch = { notes: 'updated notes' };
    const items = [{ id: 'koi-1', item_type: 'key' as const, quantity: 1, building_id: 'b-1', unit_price: 100 }];
    const expectedUpdatedAt = '2026-08-11T19:00:00.000Z';

    await act(async () => {
      await result.current.updateDraftKeyOrder.mutateAsync({
        id: 'ko-draft-2',
        order: patch,
        items,
        expectedUpdatedAt,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('update_draft_key_order_with_items', {
      p_order_id: 'ko-draft-2',
      p_patch: patch,
      p_items: items,
      p_expected_updated_at: expectedUpdatedAt,
    });
  });

  it('updateDraftKeyOrder success → shows "Cambios guardados" toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-08-11T20:00:00.000Z', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateDraftKeyOrder.mutateAsync({
        id: 'ko-draft-2',
        order: { notes: 'x' },
        items: [],
        expectedUpdatedAt: '2026-08-11T19:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.updateDraftKeyOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Cambios guardados.');
  });

  it('updateDraftKeyOrder success → invalidates keyOrdersKey() and keyOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-08-11T20:00:00.000Z', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateDraftKeyOrder.mutateAsync({
        id: 'ko-draft-2',
        order: {},
        items: [],
        expectedUpdatedAt: '2026-08-11T19:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.updateDraftKeyOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'key-order', 'ko-draft-2'],
    });
  });

  it('updateDraftKeyOrder optimistic concurrency error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'KEY_ORDER_STALE' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateDraftKeyOrder.mutateAsync({
          id: 'ko-draft-2',
          order: {},
          items: [],
          expectedUpdatedAt: '2026-08-11T18:00:00.000Z',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.updateDraftKeyOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // markKeyOrderInvoiced
  // ──────────────────────────────────────────────────────────────────────────

  it('markKeyOrderInvoiced calls rpc("mark_key_order_invoiced", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.markKeyOrderInvoiced.mutateAsync({ id: 'ko-completed-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('mark_key_order_invoiced', {
      p_order_id: 'ko-completed-1',
    });
  });

  it('markKeyOrderInvoiced success → shows invoiced toast and invalidates', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.markKeyOrderInvoiced.mutateAsync({ id: 'ko-completed-1' });
    });

    await waitFor(() => expect(result.current.markKeyOrderInvoiced.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden marcada como facturada.');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'key-order', 'ko-completed-1'],
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // setKeyOrderPickupPerson
  // ──────────────────────────────────────────────────────────────────────────

  it('setKeyOrderPickupPerson calls UPDATE on key_orders with pickup_particular_id', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setKeyOrderPickupPerson.mutateAsync({
        id: 'ko-abc',
        pickup_particular_id: 'part-2',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('key_orders');
    expect(mockUpdate).toHaveBeenCalledWith({ pickup_particular_id: 'part-2' });
    expect(mockEq).toHaveBeenCalledWith('id', 'ko-abc');
  });

  it('setKeyOrderPickupPerson success → shows pickup person toast', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setKeyOrderPickupPerson.mutateAsync({
        id: 'ko-abc',
        pickup_particular_id: 'part-2',
      });
    });

    await waitFor(() => expect(result.current.setKeyOrderPickupPerson.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Persona de retiro actualizada.');
  });

  it('setKeyOrderPickupPerson success → invalidates detail and list', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setKeyOrderPickupPerson.mutateAsync({
        id: 'ko-abc',
        pickup_particular_id: 'part-2',
      });
    });

    await waitFor(() => expect(result.current.setKeyOrderPickupPerson.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'key-order', 'ko-abc'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
  });

  it('setKeyOrderPickupPerson error → calls toastMutationError', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockEq.mockResolvedValueOnce({ error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.setKeyOrderPickupPerson.mutateAsync({
          id: 'ko-abc',
          pickup_particular_id: 'part-2',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.setKeyOrderPickupPerson.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // configureKeyOrderItem
  // ──────────────────────────────────────────────────────────────────────────

  it('configureKeyOrderItem calls rpc("configure_key_order_item") with correct args', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'key-uuid-1', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.configureKeyOrderItem.mutateAsync({
        orderItemId: 'koi-1',
        rfidCode: 'RFID-ABC',
        unitId: 'unit-1',
        equipmentIds: ['eq-1'],
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('configure_key_order_item', {
      p_order_item_id: 'koi-1',
      p_rfid_code: 'RFID-ABC',
      p_unit_id: 'unit-1',
      p_equipment_ids: ['eq-1'],
    });
  });

  it('configureKeyOrderItem success → shows success toast and invalidates', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'key-uuid-1', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKeyOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.configureKeyOrderItem.mutateAsync({
        orderItemId: 'koi-1',
        rfidCode: 'RFID-ABC',
        unitId: 'unit-1',
        equipmentIds: [],
        orderId: 'ko-1',
      });
    });

    await waitFor(() => expect(result.current.configureKeyOrderItem.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Llave configurada correctamente.');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'key-orders']) }),
    );
  });
});
