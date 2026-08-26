import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useEquipmentInventory } from '../useEquipmentInventory';
import { equipmentInventoryKey } from '@/lib/queryKeys';

const fakeRows = [
  {
    id: 'eq-1',
    serial_number: 'SN-001',
    model: 'Model X',
    status: 'active',
    access_type: 'rfid',
    building_id: 'bld-1',
    building_name: 'Torre Norte',
    administration_id: 'adm-1',
    administration_company_name: 'Garcia S.A.',
    key_count: 2,
    key_ids: ['key-1', 'key-2'],
    key_labels: ['RFID-001', 'RFID-002'],
  },
];

describe('useEquipmentInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: fakeRows, error: null });
    mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('default call uses equipmentInventoryKey with all defaults', () => {
    const { result } = renderHook(() => useEquipmentInventory(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = equipmentInventoryKey();
    expect(key).toEqual(['admin', 'equipment-inventory', 'all', 'all', 'all']);
  });

  it('queries from equipment_inventory view', async () => {
    const { result } = renderHook(() => useEquipmentInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('equipment_inventory');
  });

  it('returns data on success with no filters', async () => {
    const { result } = renderHook(() => useEquipmentInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeRows);
  });

  it('administrationId filter calls .eq("administration_id", value)', async () => {
    const { result } = renderHook(
      () => useEquipmentInventory({ administrationId: 'adm-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('administration_id', 'adm-1');
  });

  it('buildingId filter calls .eq("building_id", value)', async () => {
    const { result } = renderHook(
      () => useEquipmentInventory({ buildingId: 'bld-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('building_id', 'bld-1');
  });

  it('status filter (not "all") calls .eq("status", value)', async () => {
    const { result } = renderHook(
      () => useEquipmentInventory({ status: 'active' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
  });

  it('status="all" does not call .eq("status", ...)', async () => {
    const { result } = renderHook(
      () => useEquipmentInventory({ status: 'all' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const eqCalls = mockEq.mock.calls;
    expect(eqCalls.some((args: unknown[]) => args[0] === 'status')).toBe(false);
  });

  it('results are ordered by serial_number ascending', async () => {
    const { result } = renderHook(() => useEquipmentInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOrder).toHaveBeenCalledWith('serial_number', { ascending: true });
  });

  it('returns empty array when data is null', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useEquipmentInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useEquipmentInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
