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

// Chainable supabase mock: from → insert → select → single
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
const mockSupabase = { from: mockFrom };

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

import { useMutateParticular } from '../useMutateParticular';

const createdRow = {
  id: 'p-new',
  unit_id: 'u-9',
  dni: '30111222',
  full_name: 'García Juan',
  phone: '555-1234',
  email: 'juan@example.com',
};

describe('useMutateParticular', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: createdRow, error: null });
  });

  it('createParticular inserts the payload into particulares', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateParticular(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.createParticular.mutateAsync({
        unit_id: 'u-9',
        dni: '30111222',
        full_name: 'García Juan',
        phone: '555-1234',
        email: 'juan@example.com',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('particulares');
    expect(mockInsert).toHaveBeenCalledWith({
      unit_id: 'u-9',
      dni: '30111222',
      full_name: 'García Juan',
      phone: '555-1234',
      email: 'juan@example.com',
    });
    expect(mockSelect).toHaveBeenCalledWith();
    expect(mockSingle).toHaveBeenCalledWith();
  });

  it('success invalidates the particulares list query', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMutateParticular(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.createParticular.mutateAsync({
        unit_id: 'u-9',
        dni: '30111222',
        full_name: 'García Juan',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'particulares', ''],
    });
  });

  it('success shows the success toast', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateParticular(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.createParticular.mutateAsync({
        unit_id: 'u-9',
        dni: '30111222',
        full_name: 'García Juan',
      });
    });

    expect(toast.success).toHaveBeenCalledWith(
      'Particular creado correctamente.',
    );
  });

  it('failure delegates to toastMutationError', async () => {
    const dbError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (dni)=(30111222) already exists.',
    };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateParticular(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      try {
        await result.current.createParticular.mutateAsync({
          unit_id: 'u-9',
          dni: '30111222',
          full_name: 'García Juan',
        });
      } catch { /* expected */ }
    });

    await waitFor(() =>
      expect(result.current.createParticular.isError).toBe(true),
    );
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
    expect(result.current.createParticular.error).toBe(dbError);
  });
});
