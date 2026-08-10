import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/hooks/mapMutationError';

// Chainable supabase mock: from → insert → select → single (createKey),
// rpc (changeStatus + recordPickup)
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
const mockRpc = vi.fn();
const mockSupabase = { from: mockFrom, rpc: mockRpc };

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

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

import { useMutateKey } from '../useMutateKey';
import { keyEventsKey } from '../useKeyEvents';

const createdKey = {
  id: 'k-1',
  rfid_code: 'RFID-1',
  unit_id: 'u-1',
};

describe('useMutateKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: createdKey, error: null });
  });

  // recordPickup
  it('recordPickup calls rpc("record_order_key_pickup") with p_* args', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.recordPickup.mutateAsync({
        order_id: 'order-1',
        key_id: 'k-1',
        picked_up_by_name: 'Juan',
        picked_up_by_surname: 'García',
        picked_up_by_dni: '30111222',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('record_order_key_pickup', {
      p_key_id: 'k-1',
      p_picked_up_by_name: 'Juan',
      p_picked_up_by_surname: 'García',
      p_picked_up_by_dni: '30111222',
    });
  });

  it('recordPickup forwards actor_staff_id when present', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.recordPickup.mutateAsync({
        order_id: 'order-1',
        key_id: 'k-1',
        picked_up_by_name: 'Juan',
        picked_up_by_surname: 'García',
        picked_up_by_dni: '30111222',
        actor_staff_id: 'staff-9',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'record_order_key_pickup',
      expect.objectContaining({ p_actor_staff_id: 'staff-9' }),
    );
  });

  it('recordPickup success → shows pickup toast', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.recordPickup.mutateAsync({
        order_id: 'order-1',
        key_id: 'k-1',
        picked_up_by_name: 'Juan',
        picked_up_by_surname: 'García',
        picked_up_by_dni: '30111222',
      });
    });

    await waitFor(() => expect(result.current.recordPickup.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Retiro registrado.');
  });

  it('recordPickup success → invalidates order detail, ordens list and keys list', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.recordPickup.mutateAsync({
        order_id: 'order-1',
        key_id: 'k-1',
        picked_up_by_name: 'Juan',
        picked_up_by_surname: 'García',
        picked_up_by_dni: '30111222',
      });
    });

    await waitFor(() => expect(result.current.recordPickup.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'orden', 'order-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'ordenes', 'all', ''],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'keys', 'b-1'],
    });
  });

  it('recordPickup error → calls toastMutationError', async () => {
    const dbError = {
      code: 'P0001',
      message: 'record_order_key_pickup: order is not ready_for_pickup',
    };
    mockRpc.mockResolvedValueOnce({ error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.recordPickup.mutateAsync({
          order_id: 'order-1',
          key_id: 'k-1',
          picked_up_by_name: 'Juan',
          picked_up_by_surname: 'García',
          picked_up_by_dni: '30111222',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.recordPickup.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // createKey (regression)
  it('createKey inserts into rfid_keys and selects single row', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createKey.mutateAsync({
        rfid_code: 'RFID-1',
        unit_id: 'u-1',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('rfid_keys');
    expect(mockInsert).toHaveBeenCalledWith({ rfid_code: 'RFID-1', unit_id: 'u-1' });
    expect(mockSingle).toHaveBeenCalledWith();
  });

  // changeStatus (regression)
  it('changeStatus calls rpc("change_key_status") with p_* args', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.changeStatus.mutateAsync({
        id: 'k-1',
        status: 'active',
        note: 'Reactivada',
        actor_staff_id: 'staff-9',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('change_key_status', {
      p_key_id: 'k-1',
      p_status: 'active',
      p_note: 'Reactivada',
      p_actor_staff_id: 'staff-9',
    });
  });

  it('changeStatus success → invalidates keys list and key events', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateKey('b-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.changeStatus.mutateAsync({
        id: 'k-1',
        status: 'active',
      });
    });

    await waitFor(() => expect(result.current.changeStatus.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'keys', 'b-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: keyEventsKey('k-1'),
    });
  });
});
