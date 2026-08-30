import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { equipmentKey, tareasKey } from '@/lib/queryKeys';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

const mockCreateAndAssignRpc = vi.fn();
vi.mock('@vitalock/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vitalock/supabase')>();
  return {
    ...original,
    createAndAssignEquipment: (...args: unknown[]) => mockCreateAndAssignRpc(...args),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { useMutateTicketEquipment } from '../useMutateTicketEquipment';

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

const buildingId = 'building-1';
const ticketId = 'ticket-abc';
const input = {
  ticketId,
  buildingId,
  serial_number: 'SN-42',
  model: 'Model X',
  access_type: 'peatonal',
  description: 'front door',
};

describe('useMutateTicketEquipment.createAndAssignEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-CLIENT-EQUIP-1.2 — single RPC call replaces two-step INSERT+UPDATE
  it('on success → calls create_and_assign_equipment RPC once and invalidates tarea+tareas+equipment', async () => {
    mockCreateAndAssignRpc.mockResolvedValue('equipment-new-uuid');

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTicketEquipment(buildingId), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.createAndAssignEquipment.mutate(input);
    });

    await waitFor(() =>
      expect(result.current.createAndAssignEquipment.isSuccess).toBe(true),
    );

    expect(mockCreateAndAssignRpc).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'tarea', ticketId] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: tareasKey() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: equipmentKey(buildingId) }),
    );
  });

  it('on error → surfaces PostgrestError and calls toastMutationError', async () => {
    const rpcError = { code: '23505', message: 'duplicate serial' };
    mockCreateAndAssignRpc.mockRejectedValue(rpcError);

    const { toastMutationError } = await import('@/lib/errors/toast');
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateTicketEquipment(buildingId), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.createAndAssignEquipment.mutate(input);
    });

    await waitFor(() =>
      expect(result.current.createAndAssignEquipment.isError).toBe(true),
    );

    expect(toastMutationError).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
