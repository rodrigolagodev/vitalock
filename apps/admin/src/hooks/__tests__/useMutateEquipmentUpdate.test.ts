import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

// Hoist mocks so they're available to vi.mock factories
const { mockStorageUpload, mockStorageRemove, mockCreateEquipmentUpdateRpc } = vi.hoisted(() => ({
  mockStorageUpload: vi.fn(),
  mockStorageRemove: vi.fn(),
  mockCreateEquipmentUpdateRpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockStorageUpload,
          remove: mockStorageRemove,
        }),
      },
    };
  },
}));

vi.mock('@vitalock/supabase', () => ({
  createEquipmentUpdate: mockCreateEquipmentUpdateRpc,
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

import { useMutateEquipmentUpdate } from '../useMutateEquipmentUpdate';

const TICKET_ID = 'ticket-abc-001';
const EQUIPMENT_ID = 'equip-001';
const ADMIN_ID = 'admin-001';
const BUILDING_ID = 'building-001';

function makeFile(name: string, sizeBytes: number): File {
  const content = new Array(sizeBytes).fill('a').join('');
  return new File([content], name, { type: 'application/x-msaccess' });
}

describe('useMutateEquipmentUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects files over 50 MB before uploading', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipmentUpdate(), { wrapper: Wrapper });

    const bigFile = makeFile('big.mdb', 50 * 1024 * 1024 + 1);

    await act(async () => {
      try {
        await result.current.createEquipmentUpdate.mutateAsync({
          ticketId: TICKET_ID,
          equipmentId: EQUIPMENT_ID,
          administrationId: ADMIN_ID,
          buildingId: BUILDING_ID,
          description: 'Actualización',
          keysToActivate: [],
          keysToDisable: [],
          file: bigFile,
          actorStaffId: 'staff-1',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.createEquipmentUpdate.isError).toBe(true));
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('uploads file to storage before calling createEquipmentUpdate RPC', async () => {
    const callOrder: string[] = [];

    mockStorageUpload.mockImplementationOnce(async () => {
      callOrder.push('upload');
      return { data: { path: `${TICKET_ID}/db.mdb` }, error: null };
    });
    mockCreateEquipmentUpdateRpc.mockImplementationOnce(async (_client: unknown, input: { equipmentId: string; keysToActivate: string[]; keysToDisable: string[] }) => {
      callOrder.push('rpc');
      return 'new-task-id';
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipmentUpdate(), { wrapper: Wrapper });

    const file = makeFile('db.mdb', 1024);

    await act(async () => {
      await result.current.createEquipmentUpdate.mutateAsync({
        ticketId: TICKET_ID,
        equipmentId: EQUIPMENT_ID,
        administrationId: ADMIN_ID,
        buildingId: BUILDING_ID,
        description: 'Actualización',
        keysToActivate: ['k-1'],
        keysToDisable: ['k-2'],
        file,
        actorStaffId: 'staff-1',
      });
    });

    await waitFor(() => expect(result.current.createEquipmentUpdate.isSuccess).toBe(true));
    expect(callOrder).toEqual(['upload', 'rpc']);
    expect(mockCreateEquipmentUpdateRpc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        equipmentId: EQUIPMENT_ID,
        keysToActivate: ['k-1'],
        keysToDisable: ['k-2'],
      }),
    );
  });

  it('deletes orphaned storage object when RPC fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ data: { path: `${TICKET_ID}/db.mdb` }, error: null });
    mockCreateEquipmentUpdateRpc.mockRejectedValueOnce(new Error('RPC failed'));
    mockStorageRemove.mockResolvedValueOnce({ data: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipmentUpdate(), { wrapper: Wrapper });

    const file = makeFile('db.mdb', 1024);

    await act(async () => {
      try {
        await result.current.createEquipmentUpdate.mutateAsync({
          ticketId: TICKET_ID,
          equipmentId: EQUIPMENT_ID,
          administrationId: ADMIN_ID,
          buildingId: BUILDING_ID,
          description: 'Actualización',
          keysToActivate: [],
          keysToDisable: ['k-2'],
          file,
          actorStaffId: null,
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.createEquipmentUpdate.isError).toBe(true));
    expect(mockStorageRemove).toHaveBeenCalledWith([`${TICKET_ID}/db.mdb`]);
  });

  it('returns error state on storage upload failure', async () => {
    mockStorageUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage failed') });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateEquipmentUpdate(), { wrapper: Wrapper });

    const file = makeFile('db.mdb', 512);

    await act(async () => {
      try {
        await result.current.createEquipmentUpdate.mutateAsync({
          ticketId: TICKET_ID,
          equipmentId: EQUIPMENT_ID,
          administrationId: ADMIN_ID,
          buildingId: BUILDING_ID,
          description: 'Test',
          keysToActivate: ['k-1'],
          keysToDisable: [],
          file,
          actorStaffId: null,
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.createEquipmentUpdate.isError).toBe(true));
    expect(mockCreateEquipmentUpdateRpc).not.toHaveBeenCalled();
  });
});
