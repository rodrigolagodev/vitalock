import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/lib/errors/toast';

// Chainable supabase mock: from → insert/update → (eq →) select → single
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({
  insert: mockInsert,
  update: mockUpdate,
});
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
    mockSelect.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ select: mockSelect });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({
      insert: mockInsert,
      update: mockUpdate,
    });
  });

  describe('createParticular', () => {
    it('inserts the payload into particulares', async () => {
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
      // select() is now called with the unit-embed columns so the returned row
      // matches useParticulares' shape (unit_building_id, etc.).
      expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('units'));
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

  describe('updateParticular', () => {
    it('strips id from the update payload and targets the row by id', async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateParticular(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.updateParticular.mutateAsync({
          id: 'p-1',
          full_name: 'García Juan Actualizado',
          dni: '30111222',
        });
      });

      await waitFor(() =>
        expect(result.current.updateParticular.isSuccess).toBe(true),
      );

      const updateCall = (mockUpdate.mock.calls[0] as [Record<string, unknown>])[0];
      expect(updateCall).not.toHaveProperty('id');
      expect(updateCall).toHaveProperty('full_name', 'García Juan Actualizado');
      expect(mockEq).toHaveBeenCalledWith('id', 'p-1');
      // select() is now called with the unit-embed columns so the returned row
      // matches useParticulares' shape (unit_building_id, etc.).
      expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('units'));
      expect(mockSingle).toHaveBeenCalledWith();
    });

    it('success invalidates list and detail queries and shows the toast', async () => {
      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useMutateParticular(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.updateParticular.mutateAsync({
          id: 'p-1',
          full_name: 'García Juan Actualizado',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['admin', 'particulares', ''],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['admin', 'particular', 'p-1'],
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Particular actualizado correctamente.',
      );
    });

    it('failure delegates to toastMutationError', async () => {
      const dbError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (unit_id)=(u-9) already exists.',
      };
      mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateParticular(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        try {
          await result.current.updateParticular.mutateAsync({
            id: 'p-1',
            unit_id: 'u-9',
            full_name: 'García Juan',
          });
        } catch { /* expected */ }
      });

      await waitFor(() =>
        expect(result.current.updateParticular.isError).toBe(true),
      );
      const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]![0]).toEqual(dbError);
    });
  });

  describe('deactivateParticular', () => {
    it('updates only status to inactive, invalidates and shows the toast', async () => {
      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useMutateParticular(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.deactivateParticular.mutateAsync({ id: 'p-1' });
      });

      await waitFor(() =>
        expect(result.current.deactivateParticular.isSuccess).toBe(true),
      );

      const updateCall = (mockUpdate.mock.calls[0] as [Record<string, unknown>])[0];
      expect(updateCall).toEqual({ status: 'inactive' });
      expect(mockEq).toHaveBeenCalledWith('id', 'p-1');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['admin', 'particulares', ''],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['admin', 'particular', 'p-1'],
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Particular dado de baja correctamente.',
      );
    });

    it('failure delegates to toastMutationError', async () => {
      const dbError = { code: '23503', message: 'foreign key violation' };
      mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateParticular(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        try {
          await result.current.deactivateParticular.mutateAsync({ id: 'p-1' });
        } catch { /* expected */ }
      });

      await waitFor(() =>
        expect(result.current.deactivateParticular.isError).toBe(true),
      );
      const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]![0]).toEqual(dbError);
    });
  });
});
