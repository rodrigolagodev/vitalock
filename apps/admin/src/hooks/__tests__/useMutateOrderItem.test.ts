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

// Chainable supabase mock
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

import { useMutateOrderItem } from '../useMutateOrderItem';

describe('useMutateOrderItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockReturnValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  // configureKeyItem
  it('configureKeyItem calls supabase.rpc("configure_key_order_item") with correct payload', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'new-key-uuid', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.configureKeyItem.mutateAsync({
        orderItemId: 'item-1',
        orderId: 'order-1',
        rfidCode: 'ABC123',
        unitId: 'unit-1',
        equipmentIds: ['eq-1', 'eq-2'],
        buildingId: 'b-1',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('configure_key_order_item', {
      p_order_item_id: 'item-1',
      p_rfid_code: 'ABC123',
      p_unit_id: 'unit-1',
      p_equipment_ids: ['eq-1', 'eq-2'],
    });
  });

  it('configureKeyItem success → shows success toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'key-uuid', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.configureKeyItem.mutateAsync({
        orderItemId: 'item-2',
        orderId: 'order-2',
        rfidCode: 'XYZ999',
        unitId: 'unit-2',
        equipmentIds: [],
      });
    });

    await waitFor(() => expect(result.current.configureKeyItem.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Llave configurada correctamente.');
  });

  it('configureKeyItem success → invalidates ordenKey, ordensKey, and keysKey', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'key-uuid', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.configureKeyItem.mutateAsync({
        orderItemId: 'item-3',
        orderId: 'order-3',
        rfidCode: 'CODE3',
        unitId: 'unit-3',
        equipmentIds: [],
        buildingId: 'b-3',
      });
    });

    await waitFor(() => expect(result.current.configureKeyItem.isSuccess).toBe(true));

    // ordenKey(orderId) invalidated
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'orden', 'order-3'] }),
    );
    // ordensKey() prefix invalidated
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'ordenes']) }),
    );
    // keysKey(buildingId) invalidated
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'keys', 'b-3'] }),
    );
  });

  it('configureKeyItem error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'configure_key: item not pending' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.configureKeyItem.mutateAsync({
          orderItemId: 'item-err',
          orderId: 'order-err',
          rfidCode: 'ERR',
          unitId: 'unit-err',
          equipmentIds: [],
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.configureKeyItem.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // cancelOrderItem
  it('cancelOrderItem calls UPDATE order_items with status: "cancelled"', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrderItem.mutateAsync({
        id: 'item-cancel',
        orderId: 'order-cancel',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('order_items');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mockEq).toHaveBeenCalledWith('id', 'item-cancel');
  });

  it('cancelOrderItem success → invalidates ordenKey + ordensKey', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrderItem.mutateAsync({
        id: 'item-ci',
        orderId: 'order-ci',
      });
    });

    await waitFor(() => expect(result.current.cancelOrderItem.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'orden', 'order-ci'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'ordenes']) }),
    );
  });

  it('cancelOrderItem success → shows cancel toast', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrderItem.mutateAsync({
        id: 'item-toast',
        orderId: 'order-toast',
      });
    });

    await waitFor(() => expect(result.current.cancelOrderItem.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Ítem cancelado.');
  });
});
