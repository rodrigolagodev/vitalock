import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before the import of the module under test
// ---------------------------------------------------------------------------

const mockConfigureFn = vi.fn();

vi.mock('@vitalock/supabase', () => ({
  configureTechnicalTicketEquipment: (...args: unknown[]) => mockConfigureFn(...args),
}));

// The factory only needs supabase as an opaque object passed through to the RPC
const mockSupabase = {} as never;

vi.mock('@/lib/supabase', () => ({ get supabase() { return mockSupabase; } }));

// Import AFTER mocks are registered
import { createUseConfigureTechnicalTicketEquipment } from '../useConfigureTechnicalTicketEquipment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests — REQ-SHARED-CONFIG-EQUIP-1.1 and REQ-SHARED-CONFIG-EQUIP-1.2
// ---------------------------------------------------------------------------

describe('createUseConfigureTechnicalTicketEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-SHARED-CONFIG-EQUIP-1.1 — Successful mutation triggers onSuccess
  it('calls onSuccess with the mutation variables on a successful RPC response', async () => {
    mockConfigureFn.mockResolvedValue(undefined);

    const onSuccess = vi.fn();
    const mapMutationError = vi.fn().mockReturnValue('some error message');

    const useHook = createUseConfigureTechnicalTicketEquipment({
      supabase: mockSupabase,
      onSuccess,
      mapMutationError,
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

    const input = { ticketId: 'ticket-1', newSerial: 'SN-001', newModel: 'Model X' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(input);
    expect(mapMutationError).not.toHaveBeenCalled();
  });

  // REQ-SHARED-CONFIG-EQUIP-1.2 — Failed mutation triggers mapMutationError
  it('calls mapMutationError on RPC failure and does not call onSuccess', async () => {
    const rpcError = { code: '42501', message: 'permission denied' };
    mockConfigureFn.mockRejectedValue(rpcError);

    const onSuccess = vi.fn();
    const mapMutationError = vi.fn().mockReturnValue('permission denied message');

    const useHook = createUseConfigureTechnicalTicketEquipment({
      supabase: mockSupabase,
      onSuccess,
      mapMutationError,
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

    const input = { ticketId: 'ticket-1', newSerial: 'SN-002' };

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mapMutationError).toHaveBeenCalledTimes(1);
    // TanStack Query onError signature: (error, variables, context) — assert only the error arg
    const firstCall = mapMutationError.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0]).toEqual(rpcError);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
