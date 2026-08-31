import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { worklistKey } from '@/lib/queryKeys';

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

const mockCompleteAuthorizationsRpc = vi.fn();
vi.mock('@vitalock/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vitalock/supabase')>();
  return {
    ...original,
    completeAuthorizations: (...args: unknown[]) => mockCompleteAuthorizationsRpc(...args),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { useCompleteAuthorizations } from '../useCompleteAuthorizations';

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

describe('useCompleteAuthorizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('install-only batch → single RPC call with installIds and empty removeIds', async () => {
    mockCompleteAuthorizationsRpc.mockResolvedValue(undefined);

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCompleteAuthorizations(), { wrapper: Wrapper });

    const items = [
      { id: 'auth-1', sync_state: 'pending_install' as const },
      { id: 'auth-2', sync_state: 'pending_install' as const },
    ];

    await act(async () => {
      result.current.mutate({ items });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCompleteAuthorizationsRpc).toHaveBeenCalledTimes(1);
    expect(mockCompleteAuthorizationsRpc).toHaveBeenCalledWith(
      expect.anything(),
      { installIds: ['auth-1', 'auth-2'], removeIds: [], staffId: mockStaffId },
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: worklistKey(mockStaffId) }),
    );
  });

  it('remove-only batch → single RPC call with removeIds and empty installIds', async () => {
    mockCompleteAuthorizationsRpc.mockResolvedValue(undefined);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCompleteAuthorizations(), { wrapper: Wrapper });

    const items = [
      { id: 'auth-3', sync_state: 'pending_removal' as const },
    ];

    await act(async () => {
      result.current.mutate({ items });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCompleteAuthorizationsRpc).toHaveBeenCalledTimes(1);
    expect(mockCompleteAuthorizationsRpc).toHaveBeenCalledWith(
      expect.anything(),
      { installIds: [], removeIds: ['auth-3'], staffId: mockStaffId },
    );
  });

  it('mixed batch → single RPC call splitting install and remove ids', async () => {
    mockCompleteAuthorizationsRpc.mockResolvedValue(undefined);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCompleteAuthorizations(), { wrapper: Wrapper });

    const items = [
      { id: 'auth-a', sync_state: 'pending_install' as const },
      { id: 'auth-b', sync_state: 'pending_removal' as const },
      { id: 'auth-c', sync_state: 'pending_install' as const },
    ];

    await act(async () => {
      result.current.mutate({ items });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCompleteAuthorizationsRpc).toHaveBeenCalledTimes(1);
    expect(mockCompleteAuthorizationsRpc).toHaveBeenCalledWith(
      expect.anything(),
      { installIds: ['auth-a', 'auth-c'], removeIds: ['auth-b'], staffId: mockStaffId },
    );
  });

  it('RPC failure → surfaces error and calls toastMutationError', async () => {
    const rpcError = { code: 'P0001', message: 'complete_authorizations: install batch mismatch' };
    mockCompleteAuthorizationsRpc.mockRejectedValue(rpcError);

    const { toastMutationError } = await import('@/lib/errors/toast');
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCompleteAuthorizations(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ items: [{ id: 'auth-x', sync_state: 'pending_install' }] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastMutationError).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
