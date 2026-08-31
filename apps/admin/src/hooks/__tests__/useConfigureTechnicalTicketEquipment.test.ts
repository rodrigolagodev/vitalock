import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { tareasKey } from '@/lib/queryKeys';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

// Mock the RPC function so the factory mutationFn calls our mock
const mockConfigureRpc = vi.fn();
vi.mock('@vitalock/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vitalock/supabase')>();
  return {
    ...original,
    configureTechnicalTicketEquipment: (...args: unknown[]) => mockConfigureRpc(...args),
  };
});

// The supabase instance is passed through to the RPC wrapper — just an opaque object here
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { useConfigureTechnicalTicketEquipment } from '../useConfigureTechnicalTicketEquipment';

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

describe('useConfigureTechnicalTicketEquipment (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-SHARED-CONFIG-EQUIP-1.3 — Admin invalidation set is preserved
  it('on success → invalidates tareasKey() and [admin, tarea, ticketId]', async () => {
    mockConfigureRpc.mockResolvedValue(undefined);

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConfigureTechnicalTicketEquipment(), {
      wrapper: Wrapper,
    });

    const input = { ticketId: 'ticket-abc', newSerial: 'SN-100', newModel: 'Model Z' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: tareasKey() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'tarea', 'ticket-abc'] }),
    );
  });

  // 5.5 — hook called with category='installation' ticket passes correct payload to mocked RPC
  it('passes correct ticketId + payload for installation ticket without raising', async () => {
    mockConfigureRpc.mockResolvedValue(undefined);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConfigureTechnicalTicketEquipment(), {
      wrapper: Wrapper,
    });

    // The hook is category-agnostic — it accepts any ticketId + serial + model
    const input = { ticketId: 'ticket-install-1', newSerial: 'SN-INST-01', newModel: 'Model X' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // configureTechnicalTicketEquipment(client, input) — mock receives (supabase, input)
    expect(mockConfigureRpc).toHaveBeenCalledWith(
      expect.anything(), // supabase client
      expect.objectContaining({
        ticketId: 'ticket-install-1',
        newSerial: 'SN-INST-01',
        newModel: 'Model X',
      }),
    );
  });

  it('on error → calls toastMutationError and does not invalidate queries', async () => {
    const rpcError = { code: '42501', message: 'permission denied' };
    mockConfigureRpc.mockRejectedValue(rpcError);

    const { toastMutationError } = await import('@/lib/errors/toast');
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConfigureTechnicalTicketEquipment(), {
      wrapper: Wrapper,
    });

    const input = { ticketId: 'ticket-xyz', newSerial: 'SN-999' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastMutationError).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
