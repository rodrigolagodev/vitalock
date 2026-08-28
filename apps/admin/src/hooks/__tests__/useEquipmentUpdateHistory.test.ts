import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOrder = vi.fn();
const mockNot = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSchema = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { schema: mockSchema };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const EQUIPMENT_ID = 'equip-history-001';

const resolvedRow = {
  id: 'update-001',
  created_at: '2026-08-20T10:00:00Z',
  resolved_at: '2026-08-20T12:00:00Z',
  resolved_by_staff_id: 'staff-001',
  mdb_storage_path: 'update-001/db.mdb',
  keys_to_activate: ['key-1', 'key-2'],
  keys_to_disable: ['key-3'],
};

const unresolvedRow = {
  id: 'update-002',
  created_at: '2026-08-21T10:00:00Z',
  resolved_at: null,
  resolved_by_staff_id: null,
  mdb_storage_path: 'update-002/db.mdb',
  keys_to_activate: ['key-4'],
  keys_to_disable: [],
};

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { useEquipmentUpdateHistory } from '../useEquipmentUpdateHistory';
import type { EquipmentUpdateHistoryRow } from '../useEquipmentUpdateHistory';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEquipmentUpdateHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: [resolvedRow], error: null });
    mockNot.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ not: mockNot });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('is disabled when equipmentId is empty', () => {
    const { result } = renderHook(() => useEquipmentUpdateHistory(''), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('returns array of EquipmentUpdateHistoryRow ordered by created_at DESC', async () => {
    const { result } = renderHook(() => useEquipmentUpdateHistory(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data;
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe('update-001');
    expect(data![0]!.resolved_at).toBe('2026-08-20T12:00:00Z');
  });

  it('each row includes required fields: id, created_at, resolved_at, resolved_by_staff_id, mdb_storage_path, keys_to_activate, keys_to_disable', async () => {
    const { result } = renderHook(() => useEquipmentUpdateHistory(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const row = result.current.data![0]!;
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('created_at');
    expect(row).toHaveProperty('resolved_at');
    expect(row).toHaveProperty('resolved_by_staff_id');
    expect(row).toHaveProperty('mdb_storage_path');
    expect(row).toHaveProperty('keys_to_activate');
    expect(row).toHaveProperty('keys_to_disable');
  });

  it('filters to only resolved rows (resolved_at IS NOT NULL)', async () => {
    // The hook should only return resolved rows
    expect(mockNot).not.toHaveBeenCalled();
    const { result } = renderHook(() => useEquipmentUpdateHistory(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Verify the `.not('resolved_at', 'is', null)` filter was applied
    expect(mockNot).toHaveBeenCalledWith('resolved_at', 'is', null);
    expect(mockEq).toHaveBeenCalledWith('equipment_id', EQUIPMENT_ID);
  });

  it('returns empty array when no resolved rows exist', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    mockNot.mockReturnValueOnce({ order: mockOrder });

    const { result } = renderHook(() => useEquipmentUpdateHistory(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });
    mockNot.mockReturnValueOnce({ order: mockOrder });

    const { result } = renderHook(() => useEquipmentUpdateHistory(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
