import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { equipmentKey } from '@/lib/queryKeys';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/lib/errors/toast';

// Mock supabase with schema + rpc chain
const mockRpc = vi.fn();
const mockSchema = vi.fn().mockReturnValue({ rpc: mockRpc });

const mockSupabase = { schema: mockSchema };

vi.mock('@/lib/supabase', () => ({ get supabase() { return mockSupabase; } }));

const BUILDING_ID = 'bld-rpc';

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

import { useReplaceEquipment } from '../useReplaceEquipment';

describe('useReplaceEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    mockSchema.mockReturnValue({ rpc: mockRpc });
  });

  it('happy path RPC → invalidates equipmentKey and shows success toast', async () => {
    mockRpc.mockResolvedValueOnce({ data: { new_equipment_id: 'eq-new' }, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useReplaceEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.replaceEquipment.mutateAsync({
        old_equipment_id: 'eq-old',
        new_serial_number: 'SN-NEW',
        new_model: 'New Lock Pro',
      });
    });

    await waitFor(() => expect(result.current.replaceEquipment.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: equipmentKey(BUILDING_ID) }),
    );
    expect(toast.success).toHaveBeenCalledWith('Equipo reemplazado correctamente.');
  });

  it('RPC called with correct params', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReplaceEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.replaceEquipment.mutateAsync({
        old_equipment_id: 'eq-old-2',
        new_serial_number: 'SN-XYZ',
        new_model: 'Fancy Lock',
      });
    });

    await waitFor(() => expect(result.current.replaceEquipment.isSuccess).toBe(true));

    expect(mockSchema).toHaveBeenCalledWith('operations');
    expect(mockRpc).toHaveBeenCalledWith('replace_equipment', {
      p_old_equipment_id: 'eq-old-2',
      p_new_serial_number: 'SN-XYZ',
      p_new_model: 'Fancy Lock',
      p_new_description: '',
    });
  });

  it('P0001 error → calls toastMutationError (P0001 branch)', async () => {
    const rpcError = {
      code: 'P0001',
      message: 'replace_equipment: equipment already replaced or not found',
      details: null,
    };
    mockRpc.mockResolvedValueOnce({ data: null, error: rpcError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReplaceEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.replaceEquipment.mutateAsync({
          old_equipment_id: 'eq-bad',
          new_serial_number: 'SN-BAD',
          new_model: 'Bad Lock',
        });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.replaceEquipment.isError).toBe(true));
    expect(toastMutationError).toHaveBeenCalledWith(rpcError);
  });
});
