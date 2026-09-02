import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/lib/errors/toast';

// Chainable supabase mock — supports rpc() only (technical orders have no direct table updates)
const mockRpc = vi.fn();
const mockSupabase = { rpc: mockRpc };

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

import { useMutateTechnicalOrder } from '../useMutateTechnicalOrder';

const sampleOrder = {
  client_type: 'administration' as const,
  administration_id: 'adm-1',
};
const sampleItems = [
  {
    item_type: 'maintain_equipment' as const,
    quantity: 1,
    building_id: 'b-1',
    unit_price: 200,
    intended_equipment_id: 'eq-1',
    intended_assignee_staff_id: 'staff-1',
  },
];

describe('useMutateTechnicalOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createTechnicalOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('createTechnicalOrder calls rpc("create_technical_order_with_items") with correct args', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'to-new-1', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createTechnicalOrder.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('create_technical_order_with_items', {
      p_order: sampleOrder,
      p_items: sampleItems,
      p_confirm_immediately: true,
    });
  });

  it('createTechnicalOrder success → shows success toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'to-1', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createTechnicalOrder.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    await waitFor(() => expect(result.current.createTechnicalOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden de servicio técnico creada correctamente.');
  });

  it('createTechnicalOrder success → invalidates technicalOrdersKey prefix', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'to-2', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createTechnicalOrder.mutateAsync({
        order: sampleOrder,
        items: sampleItems,
      });
    });

    await waitFor(() => expect(result.current.createTechnicalOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'technical-orders']) }),
    );
  });

  it('createTechnicalOrder error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'TECHNICAL_ORDER_EMPTY: no items' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.createTechnicalOrder.mutateAsync({
          order: sampleOrder,
          items: sampleItems,
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.createTechnicalOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // confirmTechnicalOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('confirmTechnicalOrder calls rpc("confirm_technical_order", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmTechnicalOrder.mutateAsync({ id: 'to-draft-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('confirm_technical_order', { p_order_id: 'to-draft-1' });
  });

  it('confirmTechnicalOrder success → shows "Orden confirmada" toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmTechnicalOrder.mutateAsync({ id: 'to-draft-1' });
    });

    await waitFor(() => expect(result.current.confirmTechnicalOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden confirmada.');
  });

  it('confirmTechnicalOrder success → invalidates technicalOrdersKey() and technicalOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.confirmTechnicalOrder.mutateAsync({ id: 'to-draft-1' });
    });

    await waitFor(() => expect(result.current.confirmTechnicalOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'technical-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'technical-order', 'to-draft-1'],
    });
  });

  it('confirmTechnicalOrder error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'TECHNICAL_ORDER_NOT_DRAFT' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.confirmTechnicalOrder.mutateAsync({ id: 'to-confirmed-1' });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.confirmTechnicalOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // cancelTechnicalOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('cancelTechnicalOrder calls rpc("cancel_technical_order", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelTechnicalOrder.mutateAsync({ id: 'to-abc' });
    });

    expect(mockRpc).toHaveBeenCalledWith('cancel_technical_order', { p_order_id: 'to-abc' });
  });

  it('cancelTechnicalOrder success → shows cancel toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelTechnicalOrder.mutateAsync({ id: 'to-abc' });
    });

    await waitFor(() => expect(result.current.cancelTechnicalOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden cancelada.');
  });

  it('cancelTechnicalOrder success → invalidates technicalOrdersKey() and technicalOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cancelTechnicalOrder.mutateAsync({ id: 'to-abc' });
    });

    await waitFor(() => expect(result.current.cancelTechnicalOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'technical-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'technical-order', 'to-abc'],
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateDraftTechnicalOrder
  // ──────────────────────────────────────────────────────────────────────────

  it('updateDraftTechnicalOrder calls rpc("update_draft_technical_order_with_items") with correct args', async () => {
    const newUpdatedAt = '2026-08-11T20:00:00.000Z';
    mockRpc.mockResolvedValueOnce({ data: newUpdatedAt, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    const patch = { notes: 'updated notes' };
    const items = [
      {
        id: 'toi-1',
        item_type: 'maintain_equipment' as const,
        quantity: 1,
        building_id: 'b-1',
        unit_price: 200,
        intended_equipment_id: 'eq-1',
        intended_assignee_staff_id: 'staff-1',
      },
    ];
    const expectedUpdatedAt = '2026-08-11T19:00:00.000Z';

    await act(async () => {
      await result.current.updateDraftTechnicalOrder.mutateAsync({
        id: 'to-draft-2',
        order: patch,
        items,
        expectedUpdatedAt,
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('update_draft_technical_order_with_items', {
      p_order_id: 'to-draft-2',
      p_patch: patch,
      p_items: items,
      p_expected_updated_at: expectedUpdatedAt,
    });
  });

  it('updateDraftTechnicalOrder success → shows "Cambios guardados" toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-08-11T20:00:00.000Z', error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateDraftTechnicalOrder.mutateAsync({
        id: 'to-draft-2',
        order: { notes: 'x' },
        items: [],
        expectedUpdatedAt: '2026-08-11T19:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.updateDraftTechnicalOrder.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Cambios guardados.');
  });

  it('updateDraftTechnicalOrder success → invalidates technicalOrdersKey() and technicalOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-08-11T20:00:00.000Z', error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateDraftTechnicalOrder.mutateAsync({
        id: 'to-draft-2',
        order: {},
        items: [],
        expectedUpdatedAt: '2026-08-11T19:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.updateDraftTechnicalOrder.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'technical-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'technical-order', 'to-draft-2'],
    });
  });

  it('updateDraftTechnicalOrder optimistic concurrency error → calls toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'TECHNICAL_ORDER_STALE' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateDraftTechnicalOrder.mutateAsync({
          id: 'to-draft-2',
          order: {},
          items: [],
          expectedUpdatedAt: '2026-08-11T18:00:00.000Z',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.updateDraftTechnicalOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // markTechnicalOrderInvoiced
  // ──────────────────────────────────────────────────────────────────────────

  it('markTechnicalOrderInvoiced calls rpc("mark_technical_order_invoiced", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.markTechnicalOrderInvoiced.mutateAsync({ id: 'to-completed-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('mark_technical_order_invoiced', {
      p_order_id: 'to-completed-1',
    });
  });

  it('markTechnicalOrderInvoiced success → shows invoiced toast and invalidates', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.markTechnicalOrderInvoiced.mutateAsync({ id: 'to-completed-1' });
    });

    await waitFor(() => expect(result.current.markTechnicalOrderInvoiced.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Orden marcada como facturada.');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'technical-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'technical-order', 'to-completed-1'],
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Terminal immutability — trigger enforcement via P0001
  // ──────────────────────────────────────────────────────────────────────────

  it('cancelTechnicalOrder against invoiced order → DB returns P0001 → surfaces via toastMutationError', async () => {
    // The trigger rejects UPDATE on invoiced rows
    const dbError = { code: 'P0001', message: 'TECHNICAL_ORDER_TERMINAL: cannot modify technical_orders row (status: invoiced)' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.cancelTechnicalOrder.mutateAsync({ id: 'to-invoiced' });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.cancelTechnicalOrder.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  it('markTechnicalOrderInvoiced on completed order → succeeds (completed is NOT terminal)', async () => {
    // completed → invoiced is a valid transition; the trigger should NOT block
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.markTechnicalOrderInvoiced.mutateAsync({ id: 'to-completed' });
    });

    await waitFor(() => expect(result.current.markTechnicalOrderInvoiced.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('mark_technical_order_invoiced', { p_order_id: 'to-completed' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // recomputeTechnicalOrderStatus
  // ──────────────────────────────────────────────────────────────────────────

  it('recomputeTechnicalOrderStatus calls rpc("recompute_technical_order_status", { p_order_id: id })', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.recomputeTechnicalOrderStatus.mutateAsync({ id: 'to-in-progress-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('recompute_technical_order_status', {
      p_order_id: 'to-in-progress-1',
    });
  });

  it('recomputeTechnicalOrderStatus success → invalidates technicalOrdersKey() and technicalOrderKey(id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.recomputeTechnicalOrderStatus.mutateAsync({ id: 'to-in-progress-1' });
    });

    await waitFor(() => expect(result.current.recomputeTechnicalOrderStatus.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['admin', 'technical-orders']) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'technical-order', 'to-in-progress-1'],
    });
  });

  it('recomputeTechnicalOrderStatus error → calls toastMutationError', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTechnicalOrder(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.recomputeTechnicalOrderStatus.mutateAsync({ id: 'to-x' });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.recomputeTechnicalOrderStatus.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });
});
