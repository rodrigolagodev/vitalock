import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock — equipment_inventory view, filtered by building_id
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

import { useEquipmentByBuilding } from '../useEquipmentByBuilding';
import { equipmentByBuildingKey } from '@/lib/queryKeys';

const fakeEquipment = [
  { id: 'eq-1', serial_number: 'SN-001', model: 'Model X', building_id: 'bld-1' },
  { id: 'eq-2', serial_number: 'SN-002', model: 'Model Y', building_id: 'bld-1' },
];

describe('useEquipmentByBuilding', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder.mockResolvedValue({ data: fakeEquipment, error: null });
    mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('uses equipmentByBuildingKey with the buildingId', () => {
    const key = equipmentByBuildingKey('bld-1');
    expect(key).toEqual(['admin', 'equipment-by-building', 'bld-1']);
  });

  it('uses equipmentByBuildingKey with none when no buildingId', () => {
    const key = equipmentByBuildingKey();
    expect(key).toEqual(['admin', 'equipment-by-building', 'none']);
  });

  it('is disabled when no buildingId is provided', () => {
    const { result } = renderHook(() => useEquipmentByBuilding(), { wrapper: makeWrapper() });
    // enabled=false means it will never load
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it('queries from equipment_inventory view', async () => {
    const { result } = renderHook(
      () => useEquipmentByBuilding('bld-1'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('equipment_inventory');
  });

  it('filters by building_id', async () => {
    const { result } = renderHook(
      () => useEquipmentByBuilding('bld-1'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('building_id', 'bld-1');
  });

  it('returns data on success', async () => {
    const { result } = renderHook(
      () => useEquipmentByBuilding('bld-1'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeEquipment);
  });

  it('returns empty array when data is null', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(
      () => useEquipmentByBuilding('bld-1'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(
      () => useEquipmentByBuilding('bld-1'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
