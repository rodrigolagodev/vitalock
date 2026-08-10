import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Chainable supabase mock — schema('identity') -> from('staff') -> select -> [eq] -> [or] -> order
const mockOrder = vi.fn();
const mockOr = vi.fn();
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { usePersonal } from '../usePersonal';
import { personalKey } from '@/lib/queryKeys';

const fakeStaff = [
  {
    id: 'b3b0f1a2-0000-0000-0000-000000000001',
    full_name: 'Garcia, Juan',
    email: 'juan@vitalock.com',
    phone: '+54 11 1234-5678',
    role: 'installer',
    status: 'active',
    notes: null,
    created_at: '2026-08-01T10:00:00Z',
  },
];

describe('usePersonal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy chain: select -> eq -> [or] -> order resolves with data
    mockOrder.mockResolvedValue({ data: fakeStaff, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ or: mockOr, order: mockOrder, eq: mockEq });
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('default call (no args) returns active staff without .or() or role filter', async () => {
    const { result } = renderHook(() => usePersonal(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeStaff);
    expect(mockSchema).toHaveBeenCalledWith('identity');
    expect(mockFrom).toHaveBeenCalledWith('staff');
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('default call uses personalKey with empty search + all role', () => {
    const { result } = renderHook(() => usePersonal(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);

    expect(personalKey()).toEqual(['admin', 'personal', '', 'all']);
  });

  it('search by name keeps matching rows (client-side)', async () => {
    const { result } = renderHook(() => usePersonal({ search: 'garcia' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeStaff);
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('search trims whitespace before matching', async () => {
    const { result } = renderHook(() => usePersonal({ search: '  garcia  ' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeStaff);
  });

  it('role filter calls .eq("role", value)', async () => {
    const { result } = renderHook(() => usePersonal({ role: 'installer' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockEq).toHaveBeenCalledWith('role', 'installer');
  });

  it('empty search does not call .or()', async () => {
    const { result } = renderHook(() => usePersonal({ search: '' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOr).not.toHaveBeenCalled();
  });

  it('search by uuid id (client-side) keeps matching rows', async () => {
    // '000001' only matches the uuid id — not name/email — and must still hit.
    const { result } = renderHook(() => usePersonal({ search: '000001' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeStaff);
  });

  it('search with no match returns an empty list', async () => {
    const { result } = renderHook(() => usePersonal({ search: 'zzz-nope' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => usePersonal(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(dbError);
  });
});
