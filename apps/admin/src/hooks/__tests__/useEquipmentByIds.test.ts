import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockIn = vi.fn();
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

import { useEquipmentByIds } from '../useEquipmentByIds';

describe('useEquipmentByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIn.mockResolvedValue({
      data: [
        { id: 'eq-1', serial_number: 'SN-001', model: 'ModelA' },
        { id: 'eq-2', serial_number: 'SN-002', model: null },
      ],
      error: null,
    });
    mockSelect.mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('is disabled when ids is empty', () => {
    const { result } = renderHook(() => useEquipmentByIds([]), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('fetches from operations.equipment by ids and returns Map', async () => {
    const { result } = renderHook(() => useEquipmentByIds(['eq-1', 'eq-2']), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSchema).toHaveBeenCalledWith('operations');
    expect(mockFrom).toHaveBeenCalledWith('equipment');
    expect(mockSelect).toHaveBeenCalledWith('id, serial_number, model');
    expect(mockIn).toHaveBeenCalledWith('id', ['eq-1', 'eq-2']);
    expect(result.current.data?.get('eq-1')?.serial_number).toBe('SN-001');
    expect(result.current.data?.get('eq-2')?.model).toBeNull();
  });

  it('deduplicates repeated ids', async () => {
    const { result } = renderHook(
      () => useEquipmentByIds(['eq-1', 'eq-1', 'eq-2']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, ids] = mockIn.mock.calls[0] as [string, string[]];
    expect(ids.sort()).toEqual(['eq-1', 'eq-2']);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockIn.mockResolvedValueOnce({ data: null, error: dbError });
    const { result } = renderHook(() => useEquipmentByIds(['eq-1']), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
