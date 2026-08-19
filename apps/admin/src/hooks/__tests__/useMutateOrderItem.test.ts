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

// Chainable supabase mock with per-table routing
const mockRpc = vi.fn();

// For order_kind lookup: from('all_orders').select('order_kind').eq('id', orderId).single()
const mockAllOrdersSingle = vi.fn();
const mockAllOrdersEq = vi.fn().mockReturnValue({ single: mockAllOrdersSingle });
const mockAllOrdersSelect = vi.fn().mockReturnValue({ eq: mockAllOrdersEq });

// For key_order_items UPDATE: from('key_order_items').update(...).eq(...)
const mockKeyItemsEq = vi.fn();
const mockKeyItemsUpdate = vi.fn().mockReturnValue({ eq: mockKeyItemsEq });

// For technical_order_items UPDATE: from('technical_order_items').update(...).eq(...)
const mockTechItemsEq = vi.fn();
const mockTechItemsUpdate = vi.fn().mockReturnValue({ eq: mockTechItemsEq });

// Route `from` calls by table name
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

import { useMutateOrderItem } from '../useMutateOrderItem';

describe('useMutateOrderItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: order is of kind 'key'
    mockAllOrdersSingle.mockResolvedValue({ data: { order_kind: 'key' }, error: null });
    mockAllOrdersEq.mockReturnValue({ single: mockAllOrdersSingle });
    mockAllOrdersSelect.mockReturnValue({ eq: mockAllOrdersEq });

    mockKeyItemsEq.mockResolvedValue({ error: null });
    mockKeyItemsUpdate.mockReturnValue({ eq: mockKeyItemsEq });

    mockTechItemsEq.mockResolvedValue({ error: null });
    mockTechItemsUpdate.mockReturnValue({ eq: mockTechItemsEq });

    // Route from() by table name
    mockFrom.mockImplementation((table: string) => {
      if (table === 'all_orders') return { select: mockAllOrdersSelect };
      if (table === 'key_order_items') return { update: mockKeyItemsUpdate };
      if (table === 'technical_order_items') return { update: mockTechItemsUpdate };
      // fallback
      return { update: mockKeyItemsUpdate };
    });
  });

  // configureKeyItem (unchanged surface — already calls configure_key_order_item RPC)
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

  // cancelOrderItem — now branches on order_kind via all_orders VIEW lookup
  it('cancelOrderItem for a key order: fetches order_kind from all_orders then updates key_order_items', async () => {
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'key' }, error: null });
    mockKeyItemsEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrderItem.mutateAsync({
        id: 'item-cancel',
        orderId: 'order-cancel',
      });
    });

    // Step 1: looked up order_kind
    expect(mockFrom).toHaveBeenCalledWith('all_orders');
    expect(mockAllOrdersEq).toHaveBeenCalledWith('id', 'order-cancel');

    // Step 2: updated key_order_items
    expect(mockFrom).toHaveBeenCalledWith('key_order_items');
    expect(mockKeyItemsUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mockKeyItemsEq).toHaveBeenCalledWith('id', 'item-cancel');
  });

  it('cancelOrderItem for a technical order: fetches order_kind from all_orders then updates technical_order_items', async () => {
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'technical' }, error: null });
    mockTechItemsEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrderItem.mutateAsync({
        id: 'item-tech',
        orderId: 'order-tech',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('all_orders');
    expect(mockAllOrdersEq).toHaveBeenCalledWith('id', 'order-tech');
    expect(mockFrom).toHaveBeenCalledWith('technical_order_items');
    expect(mockTechItemsUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mockTechItemsEq).toHaveBeenCalledWith('id', 'item-tech');
  });

  it('cancelOrderItem success → invalidates ordenKey + ordensKey', async () => {
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'key' }, error: null });
    mockKeyItemsEq.mockResolvedValueOnce({ error: null });

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
    mockAllOrdersSingle.mockResolvedValueOnce({ data: { order_kind: 'key' }, error: null });
    mockKeyItemsEq.mockResolvedValueOnce({ error: null });

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

  it('cancelOrderItem order_kind lookup error → calls toastMutationError', async () => {
    const dbError = { code: '42501', message: 'permission denied on all_orders' };
    mockAllOrdersSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrderItem(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.cancelOrderItem.mutateAsync({
          id: 'item-err',
          orderId: 'order-err',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.cancelOrderItem.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });
});
