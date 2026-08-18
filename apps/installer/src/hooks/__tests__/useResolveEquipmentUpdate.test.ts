import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockResolveEquipmentUpdateRpc, mockToastSuccess, mockToastError, mockToastWarning } = vi.hoisted(() => ({
  mockResolveEquipmentUpdateRpc: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock('@vitalock/supabase', () => ({
  resolveEquipmentUpdate: mockResolveEquipmentUpdateRpc,
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError, warning: mockToastWarning },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}));

vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({
    staff: { id: 'installer-001', full_name: 'Pablo', role: 'installer', status: 'active' },
  }),
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { useResolveEquipmentUpdate } from '../useResolveEquipmentUpdate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useResolveEquipmentUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls resolveEquipmentUpdate RPC with taskId and actorStaffId on success', async () => {
    mockResolveEquipmentUpdateRpc.mockResolvedValueOnce({ ticket_id: 'tkt-abc', skipped_key_ids: [] });
    const { Wrapper, queryClient } = makeWrapper();

    // Seed an assigned-tickets cache so invalidation can be tested
    queryClient.setQueryData(['assigned-tickets', 'installer-001'], []);

    const { result } = renderHook(() => useResolveEquipmentUpdate(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ taskId: 'task-abc', ticketId: 'ticket-xyz' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockResolveEquipmentUpdateRpc).toHaveBeenCalledWith(
      {},
      { taskId: 'task-abc', actorStaffId: 'installer-001' },
    );
  });

  it('shows success toast when no keys were skipped', async () => {
    mockResolveEquipmentUpdateRpc.mockResolvedValueOnce({ ticket_id: 'tkt-abc', skipped_key_ids: [] });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useResolveEquipmentUpdate(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ taskId: 'task-abc', ticketId: 'ticket-xyz' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('resuelta'));
    expect(mockToastWarning).not.toHaveBeenCalled();
  });

  it('shows warning toast with count when skipped_key_ids is non-empty', async () => {
    const skippedId = 'key-uuid-stale-0001';
    mockResolveEquipmentUpdateRpc.mockResolvedValueOnce({
      ticket_id: 'tkt-abc',
      skipped_key_ids: [skippedId],
    });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useResolveEquipmentUpdate(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ taskId: 'task-skips', ticketId: 'ticket-skips' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToastWarning).toHaveBeenCalledWith(expect.stringContaining('omitida'));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('exposes skipped_key_ids in mutation result when keys were skipped', async () => {
    const skippedIds = ['key-uuid-001', 'key-uuid-002'];
    mockResolveEquipmentUpdateRpc.mockResolvedValueOnce({
      ticket_id: 'tkt-xyz',
      skipped_key_ids: skippedIds,
    });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useResolveEquipmentUpdate(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ taskId: 'task-skips2', ticketId: 'ticket-skips2' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.skipped_key_ids).toEqual(skippedIds);
  });

  it('exposes empty skipped_key_ids in mutation result when no keys were skipped', async () => {
    mockResolveEquipmentUpdateRpc.mockResolvedValueOnce({ ticket_id: 'tkt-clean', skipped_key_ids: [] });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useResolveEquipmentUpdate(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ taskId: 'task-clean', ticketId: 'ticket-clean' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.skipped_key_ids).toEqual([]);
  });

  it('surfaces error when RPC throws', async () => {
    const rpcError = new Error('DB error');
    mockResolveEquipmentUpdateRpc.mockRejectedValueOnce(rpcError);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useResolveEquipmentUpdate(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ taskId: 'task-bad', ticketId: 'ticket-bad' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(rpcError);
  });
});
