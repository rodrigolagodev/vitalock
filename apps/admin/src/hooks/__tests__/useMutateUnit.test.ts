import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { unitsKey } from '@/lib/queryKeys';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

const BUILDING_ID = 'b-1';

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

import { useMutateUnit } from '../useMutateUnit';

describe('useMutateUnit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire mock chain after clearAllMocks
    mockEq.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate, select: mockSelect, eq: mockEq });
  });

  it('createUnit happy path → invalidates unitsKey and shows success toast', async () => {
    const fakeUnit = { id: 'u-1', number: '101', status: 'active', is_administrative: false, building_id: BUILDING_ID };
    mockSingle.mockResolvedValueOnce({ data: fakeUnit, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateUnit(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createUnit.mutateAsync({
        building_id: BUILDING_ID,
        number: '101',
        is_administrative: false,
      });
    });

    await waitFor(() => expect(result.current.createUnit.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: unitsKey(BUILDING_ID) }),
    );
    expect(toast.success).toHaveBeenCalledWith('Unidad creada correctamente.');
  });

  it('deactivateUnit happy path → invalidates unitsKey and shows success toast', async () => {
    const fakeUnit = { id: 'u-2', status: 'inactive' };
    mockSingle.mockResolvedValueOnce({ data: fakeUnit, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateUnit(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.deactivateUnit.mutateAsync({ id: 'u-2', building_id: BUILDING_ID });
    });

    await waitFor(() => expect(result.current.deactivateUnit.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: unitsKey(BUILDING_ID) }),
    );
    expect(toast.success).toHaveBeenCalledWith('Unidad desactivada correctamente.');
  });

  it('createUnit error 23505 units_one_admin_per_building → calls toastMutationError', async () => {
    const dbError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (building_id)=(b-1) conflicts with units_one_admin_per_building.',
    };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateUnit(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.createUnit.mutateAsync({
          building_id: BUILDING_ID,
          number: '102',
          is_administrative: true,
        });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.createUnit.isError).toBe(true));
    expect(toastMutationError).toHaveBeenCalledWith(dbError);
  });

  it('updateUnit payload does NOT include building_id', async () => {
    const fakeUnit = { id: 'u-3', number: '103', status: 'active', is_administrative: false };
    mockSingle.mockResolvedValueOnce({ data: fakeUnit, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateUnit(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateUnit.mutateAsync({
        id: 'u-3',
        number: '103',
        is_administrative: false,
      });
    });

    await waitFor(() => expect(result.current.updateUnit.isSuccess).toBe(true));

    // Verify update was called with only {number, is_administrative}, NOT building_id
    const updateCall = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateCall).toBeDefined();
    expect(updateCall).not.toHaveProperty('building_id');
    expect(updateCall).toHaveProperty('number', '103');
  });
});
