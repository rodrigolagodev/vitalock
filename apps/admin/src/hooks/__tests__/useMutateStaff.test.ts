import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/hooks/mapMutationError';

// Chainable supabase mock — schema('identity') -> from('staff') -> insert/update
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
const mockSchema = vi.fn().mockReturnValue({ from: mockFrom });
const mockSupabase = { schema: mockSchema };

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

import { useMutateStaff } from '../useMutateStaff';

describe('useMutateStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockReset();
    mockSelect.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      eq: mockEq,
    });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  describe('createStaff', () => {
    it('inserts into identity.staff with status active, invalidates and shows success toast', async () => {
      const fakeStaff = { id: 's-1', full_name: 'Juan Perez', role: 'installer', status: 'active' };
      mockSingle.mockResolvedValueOnce({ data: fakeStaff, error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateStaff(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.createStaff.mutateAsync({
          full_name: 'Juan Perez',
          email: 'juan@vitalock.com',
          role: 'installer',
        });
      });

      await waitFor(() =>
        expect(result.current.createStaff.isSuccess).toBe(true),
      );

      expect(mockSchema).toHaveBeenCalledWith('identity');
      expect(mockFrom).toHaveBeenCalledWith('staff');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Juan Perez',
          email: 'juan@vitalock.com',
          role: 'installer',
          status: 'active',
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'personal'] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'staff'] }),
      );
      expect(toast.success).toHaveBeenCalledWith('Personal creado correctamente.');
    });

    it('error → calls toastMutationError', async () => {
      const dbError = { code: '23505', message: 'duplicate key value violates unique constraint' };
      mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStaff(), { wrapper: Wrapper });

      await act(async () => {
        try {
          await result.current.createStaff.mutateAsync({
            full_name: 'Otro',
            role: 'admin',
          });
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.createStaff.isError).toBe(true));
      const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]![0]).toEqual(dbError);
    });
  });

  describe('updateStaff', () => {
    it('strips id and excludes status from the update payload', async () => {
      const fakeStaff = { id: 's-1', full_name: 'Juan Updated', role: 'installer', status: 'active' };
      mockSingle.mockResolvedValueOnce({ data: fakeStaff, error: null });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStaff(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.updateStaff.mutateAsync({
          id: 's-1',
          full_name: 'Juan Updated',
          notes: 'ok',
        });
      });

      await waitFor(() => expect(result.current.updateStaff.isSuccess).toBe(true));

      const updateCall = (mockUpdate.mock.calls[0] as [Record<string, unknown>])[0];
      expect(updateCall).not.toHaveProperty('id');
      expect(updateCall).not.toHaveProperty('status');
      expect(updateCall).toHaveProperty('full_name', 'Juan Updated');
      expect(mockEq).toHaveBeenCalledWith('id', 's-1');
    });
  });

  describe('deactivateStaff', () => {
    it('updates only status to inactive, invalidates and shows success toast', async () => {
      const fakeStaff = { id: 's-1', status: 'inactive' };
      mockSingle.mockResolvedValueOnce({ data: fakeStaff, error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateStaff(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.deactivateStaff.mutateAsync({ id: 's-1' });
      });

      await waitFor(() =>
        expect(result.current.deactivateStaff.isSuccess).toBe(true),
      );

      const updateCall = (mockUpdate.mock.calls[0] as [Record<string, unknown>])[0];
      expect(updateCall).toEqual({ status: 'inactive' });
      expect(mockEq).toHaveBeenCalledWith('id', 's-1');
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'personal'] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'staff'] }),
      );
      expect(toast.success).toHaveBeenCalledWith(
        'Personal dado de baja correctamente.',
      );
    });
  });
});
