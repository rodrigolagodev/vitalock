import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Mock mapMutationError to capture calls
vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/hooks/mapMutationError';

// Chainable supabase mock
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockFrom = vi.fn().mockReturnValue({
  insert: mockInsert,
  update: mockUpdate,
  select: mockSelect,
  eq: mockEq,
});

const mockSupabase = { from: mockFrom };

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

import { useMutateBuilding } from '../useMutateBuilding';

// The prefix used for all buildings invalidation
const buildingsPrefix = ['admin', 'buildings'];

describe('useMutateBuilding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createBuilding happy path → invalidates buildings prefix and shows success toast', async () => {
    const fakeBuilding = { id: 'b-1', name: 'Torre Norte', address: null, status: 'active' };
    mockSingle.mockResolvedValueOnce({ data: fakeBuilding, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateBuilding(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createBuilding.mutateAsync({
        name: 'Torre Norte',
        address: null,
        administration_id: 'adm-1',
      });
    });

    await waitFor(() => expect(result.current.createBuilding.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: buildingsPrefix }),
    );
    expect(toast.success).toHaveBeenCalledWith('Edificio creado correctamente.');
  });

  it('createBuilding error path → calls toastMutationError', async () => {
    const dbError = { code: '23505', message: 'duplicate key', details: null };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateBuilding(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.createBuilding.mutateAsync({
          name: 'Torre Duplicada',
          address: null,
          administration_id: 'adm-1',
        });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.createBuilding.isError).toBe(true));
    expect(toastMutationError).toHaveBeenCalledWith(dbError);
  });

  it('deactivateBuilding happy path → invalidates buildings prefix and shows success toast', async () => {
    const fakeBuilding = { id: 'b-2', status: 'inactive' };
    mockSingle.mockResolvedValueOnce({ data: fakeBuilding, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateBuilding(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.deactivateBuilding.mutateAsync({ id: 'b-2' });
    });

    await waitFor(() => expect(result.current.deactivateBuilding.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: buildingsPrefix }),
    );
    expect(toast.success).toHaveBeenCalledWith('Edificio desactivado correctamente.');
  });

  it('deactivateBuilding error path (23503 active children) → calls toastMutationError', async () => {
    const dbError = { code: '23503', message: 'foreign key violation' };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateBuilding(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.deactivateBuilding.mutateAsync({ id: 'b-3' });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.deactivateBuilding.isError).toBe(true));
    expect(toastMutationError).toHaveBeenCalledWith(dbError);
  });

  it('prefix invalidation covers both scoped and unscoped buildings keys (task 4.13)', async () => {
    // Verify that the invalidation uses ['admin','buildings'] prefix (covers all variants)
    const fakeBuilding = { id: 'b-5', status: 'inactive' };
    mockSingle.mockResolvedValueOnce({ data: fakeBuilding, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateBuilding(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.deactivateBuilding.mutateAsync({ id: 'b-5' });
    });

    await waitFor(() => expect(result.current.deactivateBuilding.isSuccess).toBe(true));

    // Must use prefix ['admin','buildings'] — not a specific scoped key
    const call = (invalidateSpy.mock.calls[0] as [{ queryKey: unknown[] }])[0];
    expect(call.queryKey).toEqual(buildingsPrefix);
  });
});
