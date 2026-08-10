import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Shared mock refs — module-level so tests can inspect them
const mockOrder = vi.fn();
const mockOr = vi.fn();
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

import { useAdministrations } from '../useAdministrations';

const fakeAdmins = [
  {
    id: 'a-1',
    company_name: 'Garcia S.A.',
    tax_id: '30-71234567-9',
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
  },
];

describe('useAdministrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Chain: select → [eq?] → [or?] → order
    // order is the terminal step and resolves the promise
    mockOrder.mockResolvedValue({ data: fakeAdmins, error: null });
    mockOr.mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValue({ or: mockOr, order: mockOrder });
    mockSelect.mockReturnValue({ or: mockOr, eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('default call (no args) returns data without .or() filter', async () => {
    const { result } = renderHook(() => useAdministrations(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fakeAdmins);
    // .or() should NOT have been called
    expect(mockOr).not.toHaveBeenCalled();
  });

  it('default call is backward-compatible (BuildingFormSheet regression guard)', async () => {
    // Calling useAdministrations() with no args must not throw and must return an array
    const { result } = renderHook(() => useAdministrations(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it('search param fires .or() with combined ILIKE string', async () => {
    const { result } = renderHook(
      () => useAdministrations({ search: 'garcia' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOr).toHaveBeenCalledWith(
      'company_name.ilike.%garcia%,tax_id.ilike.%garcia%',
    );
  });

  it('search param trims whitespace before building the ILIKE string', async () => {
    const { result } = renderHook(
      () => useAdministrations({ search: '  garcia  ' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOr).toHaveBeenCalledWith(
      'company_name.ilike.%garcia%,tax_id.ilike.%garcia%',
    );
  });

  it('empty search string does not call .or()', async () => {
    const { result } = renderHook(
      () => useAdministrations({ search: '' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOr).not.toHaveBeenCalled();
  });
});
