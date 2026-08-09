import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Mock supabase with schema chain
const mockIn = vi.fn();
const mockEq = vi.fn().mockReturnValue({ in: mockIn });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
const mockSchema = vi.fn().mockReturnValue({ from: mockFrom });

const mockSupabase = { schema: mockSchema };

vi.mock('@/lib/supabase', () => ({ get supabase() { return mockSupabase; } }));

const EQUIPMENT_ID = 'eq-abc';

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

import { useDecommissionImpact } from '../useDecommissionImpact';

describe('useDecommissionImpact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIn.mockReset();
    mockEq.mockReturnValue({ in: mockIn });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('query is disabled when enabled=false — no fetch occurs', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useDecommissionImpact(EQUIPMENT_ID, false),
      { wrapper: Wrapper },
    );

    // Query should not have fired
    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('returns count from COUNT response when enabled=true', async () => {
    mockIn.mockResolvedValueOnce({ count: 3, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useDecommissionImpact(EQUIPMENT_ID, true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(3);
  });

  it('returns 0 when count is 0 (no pending authorizations)', async () => {
    mockIn.mockResolvedValueOnce({ count: 0, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useDecommissionImpact(EQUIPMENT_ID, true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it('returns 0 when count is null (fallback)', async () => {
    mockIn.mockResolvedValueOnce({ count: null, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useDecommissionImpact(EQUIPMENT_ID, true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it('throws when supabase returns an error', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockIn.mockResolvedValueOnce({ count: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useDecommissionImpact(EQUIPMENT_ID, true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('uses correct schema and filters', async () => {
    mockIn.mockResolvedValueOnce({ count: 2, error: null });

    const { Wrapper } = makeWrapper();
    renderHook(() => useDecommissionImpact(EQUIPMENT_ID, true), { wrapper: Wrapper });

    await waitFor(() => expect(mockIn).toHaveBeenCalled());

    expect(mockSchema).toHaveBeenCalledWith('operations');
    expect(mockFrom).toHaveBeenCalledWith('key_authorizations');
    expect(mockEq).toHaveBeenCalledWith('equipment_id', EQUIPMENT_ID);
    expect(mockIn).toHaveBeenCalledWith('sync_state', ['pending_install', 'pending_removal']);
  });
});
