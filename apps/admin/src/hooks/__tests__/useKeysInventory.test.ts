import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock
const mockOrder = vi.fn();
const mockIs = vi.fn();
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

import { useKeysInventory } from '../useKeysInventory';
import { keysInventoryKey } from '@/lib/queryKeys';

const fakeRows = [
  {
    id: 'key-1',
    rfid_code: 'RFID-001',
    physical_status: 'active',
    unit_id: 'unit-1',
    unit_number: '1A',
    building_id: 'bld-1',
    building_name: 'Torre Norte',
    administration_id: 'adm-1',
    administration_company_name: 'Garcia S.A.',
    equipment_id: 'eq-1',
    equipment_serial_number: 'SN-001',
    equipment_model: 'Model X',
    active_order_id: null,
    active_order_status: null,
  },
];

describe('useKeysInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy chain: from → select → order resolves with data
    mockOrder.mockResolvedValue({ data: fakeRows, error: null });
    mockIs.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ eq: mockEq, is: mockIs, order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq, is: mockIs, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('default call uses keysInventoryKey with all defaults', () => {
    const { result } = renderHook(() => useKeysInventory(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    const key = keysInventoryKey();
    expect(key).toEqual(['admin', 'keys-inventory', 'all', 'all', 'all', 'all', 'all']);
  });

  it('queries from keys_inventory view', async () => {
    const { result } = renderHook(() => useKeysInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('keys_inventory');
  });

  it('returns data on success with no filters', async () => {
    const { result } = renderHook(() => useKeysInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeRows);
  });

  it('administrationId filter calls .eq("administration_id", value)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ administrationId: 'adm-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('administration_id', 'adm-1');
  });

  it('buildingId filter calls .eq("building_id", value)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ buildingId: 'bld-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('building_id', 'bld-1');
  });

  it('equipmentId filter calls .eq("equipment_id", value)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ equipmentId: 'eq-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('equipment_id', 'eq-1');
  });

  it('physicalStatus filter (not "all") calls .eq("physical_status", value)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ physicalStatus: 'active' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('physical_status', 'active');
  });

  it('physicalStatus="all" does not call .eq("physical_status", ...)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ physicalStatus: 'all' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const eqCalls = mockEq.mock.calls;
    expect(eqCalls.some(([col]) => col === 'physical_status')).toBe(false);
  });

  it('workflowStatus="__none__" calls .is("active_order_id", null)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ workflowStatus: '__none__' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIs).toHaveBeenCalledWith('active_order_id', null);
  });

  it('workflowStatus="confirmed" (not __none__, not all) calls .eq("active_order_status", value)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ workflowStatus: 'confirmed' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('active_order_status', 'confirmed');
  });

  it('workflowStatus="all" fires no .is() or .eq("active_order_status", ...)', async () => {
    const { result } = renderHook(
      () => useKeysInventory({ workflowStatus: 'all' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIs).not.toHaveBeenCalled();
    const eqCalls = mockEq.mock.calls;
    expect(eqCalls.some(([col]) => col === 'active_order_status')).toBe(false);
  });

  it('results are ordered by rfid_code ascending', async () => {
    const { result } = renderHook(() => useKeysInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOrder).toHaveBeenCalledWith('rfid_code', { ascending: true });
  });

  it('returns empty array when data is null', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useKeysInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useKeysInventory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
