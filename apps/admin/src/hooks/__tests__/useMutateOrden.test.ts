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
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
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

import { useMutateOrden } from '../useMutateOrden';

const sampleOrder = {
  order_type: 'keys' as const,
  client_type: 'administration' as const,
  administration_id: 'adm-1',
};
const sampleItems = [
  { item_type: 'key' as const, quantity: 1, building_id: 'b-1' },
];

describe('useMutateOrden', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset eq chain
    mockEq.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  // createOrden
  it('createOrden calls supabase.rpc("create_order_with_items") with p_order + p_items', async () => {
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

    expect(mockRpc).toHaveBeenCalledWith('create_order_with_items', {
      p_order: sampleOrder,
      p_items: sampleItems,
    });
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

    expect(mockRpc).toHaveBeenCalledWith('create_order_with_items', {
      p_order: expect.objectContaining({
        order_type: 'keys',
        client_type: 'particular',
        particular_id: 'part-1',
        particular_full_name: 'García Juan',
      }),
      p_items: sampleItems,
    });
  });

  it('createOrden error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'create_order: at least one item required' };
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

  // cancelOrden
  it('cancelOrden calls UPDATE with status: "cancelled"', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrden.mutateAsync({ id: 'order-abc' });
    });

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mockEq).toHaveBeenCalledWith('id', 'order-abc');
  });

  it('cancelOrden success → shows cancel toast', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelOrden.mutateAsync({ id: 'order-abc' });
    });

    await waitFor(() => expect(result.current.cancelOrden.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden cancelada.');
  });

  // advanceOrdenStatus
  it('advanceOrdenStatus calls UPDATE with status: "in_preparation"', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.advanceOrdenStatus.mutateAsync({ id: 'order-xyz' });
    });

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'in_preparation' });
    expect(mockEq).toHaveBeenCalledWith('id', 'order-xyz');
  });

  it('advanceOrdenStatus success → shows preparación toast', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.advanceOrdenStatus.mutateAsync({ id: 'order-xyz' });
    });

    await waitFor(() => expect(result.current.advanceOrdenStatus.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Preparación iniciada.');
  });

  // setPickupPerson
  it('setPickupPerson calls UPDATE with pickup_particular_id and filters by id', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateOrden(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setPickupPerson.mutateAsync({
        id: 'order-abc',
        pickup_particular_id: 'part-2',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(mockUpdate).toHaveBeenCalledWith({ pickup_particular_id: 'part-2' });
    expect(mockEq).toHaveBeenCalledWith('id', 'order-abc');
  });

  it('setPickupPerson success → shows pickup person toast', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

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
    mockEq.mockResolvedValueOnce({ error: null });

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
    const dbError = { code: 'P0001', message: 'record_order_key_pickup: order not found' };
    mockEq.mockResolvedValueOnce({ error: dbError });

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
