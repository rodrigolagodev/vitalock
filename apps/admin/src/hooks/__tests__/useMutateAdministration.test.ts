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

import { useMutateAdministration } from '../useMutateAdministration';

describe('useMutateAdministration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock chain
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
  });

  describe('createAdministration', () => {
    it('happy path → calls supabase insert, invalidates prefix, shows success toast', async () => {
      const fakeAdmin = { id: 'a-1', company_name: 'Garcia S.A.', status: 'active' };
      mockSingle.mockResolvedValueOnce({ data: fakeAdmin, error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateAdministration(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createAdministration.mutateAsync({
          company_name: 'Garcia S.A.',
        });
      });

      await waitFor(() =>
        expect(result.current.createAdministration.isSuccess).toBe(true),
      );

      expect(mockFrom).toHaveBeenCalledWith('administrations');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ company_name: 'Garcia S.A.' }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'administrations'] }),
      );
      expect(toast.success).toHaveBeenCalledWith('Administración creada correctamente.');
    });

    it('23505 tax_id duplicate → calls toastMutationError', async () => {
      const dbError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (tax_id)=(30-71234567-9) conflicts with existing key in "administrations_tax_id_key".',
      };
      mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateAdministration(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        try {
          await result.current.createAdministration.mutateAsync({
            company_name: 'Otra S.A.',
            tax_id: '30-71234567-9',
          });
        } catch {
          // expected
        }
      });

      await waitFor(() =>
        expect(result.current.createAdministration.isError).toBe(true),
      );
      expect(toastMutationError).toHaveBeenCalledWith(dbError);
    });
  });

  describe('updateAdministration', () => {
    it('excludes lifecycle fields (status, created_at, updated_at) from update payload', async () => {
      const fakeAdmin = { id: 'a-1', company_name: 'Garcia S.A. Updated', status: 'active' };
      mockSingle.mockResolvedValueOnce({ data: fakeAdmin, error: null });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateAdministration(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.updateAdministration.mutateAsync({
          id: 'a-1',
          company_name: 'Garcia S.A. Updated',
          tax_id: '30-71234567-9',
        });
      });

      await waitFor(() =>
        expect(result.current.updateAdministration.isSuccess).toBe(true),
      );

      // The update payload should NOT include 'id' (stripped), or status/lifecycle
      const updateCall = (mockUpdate.mock.calls[0] as [Record<string, unknown>])[0];
      expect(updateCall).not.toHaveProperty('id');
      expect(updateCall).not.toHaveProperty('status');
      expect(updateCall).not.toHaveProperty('created_at');
      expect(updateCall).not.toHaveProperty('updated_at');
      expect(updateCall).toHaveProperty('company_name', 'Garcia S.A. Updated');
    });

    it('happy path → invalidates administrations prefix', async () => {
      const fakeAdmin = { id: 'a-1', company_name: 'Updated', status: 'active' };
      mockSingle.mockResolvedValueOnce({ data: fakeAdmin, error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateAdministration(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.updateAdministration.mutateAsync({
          id: 'a-1',
          company_name: 'Updated',
        });
      });

      await waitFor(() =>
        expect(result.current.updateAdministration.isSuccess).toBe(true),
      );

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'administrations'] }),
      );
    });
  });

  describe('deactivateAdministration', () => {
    it('happy path → sets status inactive and shows success toast', async () => {
      const fakeAdmin = { id: 'a-1', status: 'inactive' };
      mockSingle.mockResolvedValueOnce({ data: fakeAdmin, error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateAdministration(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.deactivateAdministration.mutateAsync({ id: 'a-1' });
      });

      await waitFor(() =>
        expect(result.current.deactivateAdministration.isSuccess).toBe(true),
      );

      const updateCall = (mockUpdate.mock.calls[0] as [Record<string, unknown>])[0];
      expect(updateCall).toEqual({ status: 'inactive' });
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'administrations'] }),
      );
      expect(toast.success).toHaveBeenCalledWith(
        'Administración desactivada correctamente.',
      );
    });
  });
});
