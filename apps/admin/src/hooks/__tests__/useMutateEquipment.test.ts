import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { equipmentKey } from '@/lib/queryKeys';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/hooks/mapMutationError';

// Chainable supabase mock for schema('operations') chain
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

const BUILDING_ID = 'bld-1';

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

import { useMutateEquipment } from '../useMutateEquipment';

describe('useMutateEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire mock chain after clearAllMocks
    mockSingle.mockReset();
    mockSelect.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate, select: mockSelect, eq: mockEq });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('createEquipment happy path → invalidates equipmentKey and shows success toast', async () => {
    const fakeEquipment = {
      id: 'eq-1',
      model: 'Smart Lock Pro',
      serial_number: 'SN-001',
      status: 'active',
      installed_at: '2024-01-01',
      building_id: BUILDING_ID,
    };
    mockSingle.mockResolvedValueOnce({ data: fakeEquipment, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createEquipment.mutateAsync({
        building_id: BUILDING_ID,
        serial_number: 'SN-001',
        model: 'Smart Lock Pro',
        installed_at: '2024-01-01',
      });
    });

    await waitFor(() => expect(result.current.createEquipment.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: equipmentKey(BUILDING_ID) }),
    );
    expect(toast.success).toHaveBeenCalledWith('Equipo creado correctamente.');
  });

  it('createEquipment payload does NOT include replaces_equipment_id', async () => {
    const fakeEquipment = {
      id: 'eq-2',
      model: 'Lock Basic',
      serial_number: 'SN-002',
      status: 'active',
      installed_at: '2024-01-01',
      building_id: BUILDING_ID,
    };
    mockSingle.mockResolvedValueOnce({ data: fakeEquipment, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createEquipment.mutateAsync({
        building_id: BUILDING_ID,
        serial_number: 'SN-002',
        model: 'Lock Basic',
        installed_at: '2024-01-01',
      });
    });

    await waitFor(() => expect(result.current.createEquipment.isSuccess).toBe(true));

    const insertCall = mockInsert.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertCall).toBeDefined();
    expect(insertCall).not.toHaveProperty('replaces_equipment_id');
    expect(insertCall).toHaveProperty('building_id', BUILDING_ID);
    expect(insertCall).toHaveProperty('serial_number', 'SN-002');
  });

  it('updateEquipment payload does NOT include immutable fields', async () => {
    const fakeEquipment = {
      id: 'eq-3',
      model: 'Updated Model',
      serial_number: 'SN-003',
      status: 'active',
      installed_at: '2024-01-01',
      building_id: BUILDING_ID,
    };
    mockSingle.mockResolvedValueOnce({ data: fakeEquipment, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateEquipment.mutateAsync({
        id: 'eq-3',
        model: 'Updated Model',
      });
    });

    await waitFor(() => expect(result.current.updateEquipment.isSuccess).toBe(true));

    const updateCall = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateCall).toBeDefined();
    // Immutable fields must NOT be in update payload
    expect(updateCall).not.toHaveProperty('serial_number');
    expect(updateCall).not.toHaveProperty('building_id');
    expect(updateCall).not.toHaveProperty('installed_at');
    expect(updateCall).not.toHaveProperty('replaces_equipment_id');
    // Mutable field must be present
    expect(updateCall).toHaveProperty('model', 'Updated Model');
  });

  it('updateEquipment 23514 immutable-field error → calls toastMutationError', async () => {
    const dbError = {
      code: '23514',
      message: 'new row for relation "equipment" violates check constraint — equipment immutable field',
      details: null,
    };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateEquipment.mutateAsync({ id: 'eq-4', model: 'Bad' });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.updateEquipment.isError).toBe(true));
    expect(toastMutationError).toHaveBeenCalledWith(dbError);
  });

  it('updateStatus with decommission_reason → calls equipment update with status:dead and reason', async () => {
    const fakeEquipment = { id: 'eq-5', status: 'dead' };
    mockSingle.mockResolvedValueOnce({ data: fakeEquipment, error: null });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMutateEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateStatus.mutateAsync({
        id: 'eq-5',
        status: 'dead',
        decommission_reason: 'Damaged beyond repair',
      });
    });

    await waitFor(() => expect(result.current.updateStatus.isSuccess).toBe(true));

    const updateCall = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateCall).toBeDefined();
    expect(updateCall).toHaveProperty('status', 'dead');
    expect(updateCall).toHaveProperty('decommission_reason', 'Damaged beyond repair');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: equipmentKey(BUILDING_ID) }),
    );
  });

  it('updateStatus 23514 dead-transition error → calls toastMutationError', async () => {
    const dbError = {
      code: '23514',
      message: 'equipment.status transitions out of dead are not allowed',
      details: null,
    };
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipment(BUILDING_ID), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateStatus.mutateAsync({ id: 'eq-6', status: 'active' });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.updateStatus.isError).toBe(true));
    expect(toastMutationError).toHaveBeenCalledWith(dbError);
  });
});
