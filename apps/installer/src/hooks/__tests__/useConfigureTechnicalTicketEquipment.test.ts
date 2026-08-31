import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { assignedTicketsKey } from '@/lib/queryKeys';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

const mockStaffId = 'staff-installer-001';

vi.mock('@vitalock/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vitalock/shared')>();
  return {
    ...original,
    useAuthContext: () => ({
      staff: { id: mockStaffId, full_name: 'Luis', role: 'installer', status: 'active' },
    }),
  };
});

// Mock the RPC function
const mockConfigureRpc = vi.fn();
vi.mock('@vitalock/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vitalock/supabase')>();
  return {
    ...original,
    configureTechnicalTicketEquipment: (...args: unknown[]) => mockConfigureRpc(...args),
  };
});

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

describe('useConfigureTechnicalTicketEquipment (installer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-SHARED-CONFIG-EQUIP-1.4 — Installer invalidation set is preserved
  it('on success → invalidates assignedTicketsKey(staffId)', async () => {
    mockConfigureRpc.mockResolvedValue(undefined);

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConfigureTechnicalTicketEquipment(), {
      wrapper: Wrapper,
    });

    const input = { ticketId: 'ticket-installer-1', newSerial: 'SN-200' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: assignedTicketsKey(mockStaffId) }),
    );
  });

  // 5.7 — symmetric case for category='installation' through mocked RPC
  it('passes correct payload for installation ticket without raising', async () => {
    mockConfigureRpc.mockResolvedValue(undefined);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConfigureTechnicalTicketEquipment(), {
      wrapper: Wrapper,
    });

    const input = { ticketId: 'ticket-install-i', newSerial: 'SN-INST-INS', newModel: null };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Hook is category-agnostic: RPC is called with (supabase, input) regardless of category
    expect(mockConfigureRpc).toHaveBeenCalledWith(
      expect.anything(), // supabase client
      expect.objectContaining({
        ticketId: 'ticket-install-i',
        newSerial: 'SN-INST-INS',
        newModel: null,
      }),
    );
  });

  it('on error → calls toastMutationError and does not invalidate queries', async () => {
    const rpcError = { code: 'P0001', message: 'ticket not found' };
    mockConfigureRpc.mockRejectedValue(rpcError);

    const { toastMutationError } = await import('@/lib/errors/toast');
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConfigureTechnicalTicketEquipment(), {
      wrapper: Wrapper,
    });

    const input = { ticketId: 'ticket-installer-2', newSerial: 'SN-201' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastMutationError).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
