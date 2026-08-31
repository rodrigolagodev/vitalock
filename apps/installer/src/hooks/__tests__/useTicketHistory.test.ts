import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockStaffId = 'staff-bruno-001';
vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({
    staff: { id: mockStaffId, full_name: 'Bruno', role: 'installer', status: 'active' },
  }),
}));

const { fromCalls } = vi.hoisted(() => ({
  fromCalls: [] as Array<{ schema: string | null; from: string }>,
}));

vi.mock('@/main', () => {
  const mockViewRows = [
    {
      id: 'ticket-hist-1',
      description: 'Reemplazo terminado',
      status: 'resolved',
      category: 'equipment_replacement',
      opened_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-02T12:00:00Z',
      resolved_at: '2026-07-02T12:00:00Z',
      resolution_notes: 'ok',
      cancellation_reason: null,
      building_id: 'bld-1',
      building_name: 'Torre Callao',
      building_administration_id: 'adm-1',
      administration_company_name: 'Admin SA',
    },
  ];

  const viewChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: mockViewRows, error: null }),
  };

  let currentSchema: string | null = null;

  return {
    supabase: {
      schema: vi.fn().mockImplementation((s: string) => {
        currentSchema = s;
        return {
          from: vi.fn().mockImplementation((table: string) => {
            fromCalls.push({ schema: currentSchema, from: table });
            currentSchema = null;
            return { select: vi.fn().mockReturnValue(viewChain) };
          }),
        };
      }),
      from: vi.fn().mockImplementation((table: string) => {
        fromCalls.push({ schema: null, from: table });
        return { select: vi.fn().mockReturnValue(viewChain) };
      }),
    },
  };
});

import { useTicketHistory } from '../useTicketHistory';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useTicketHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls.length = 0;
  });

  it('issues a single query against support.installer_tickets_with_context (no stitching)', async () => {
    const { result } = renderHook(() => useTicketHistory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fromCalls).toEqual([
      { schema: 'support', from: 'installer_tickets_with_context' },
    ]);
  });

  it('reshapes flat view columns into the nested building/administration shape consumers expect', async () => {
    const { result } = renderHook(() => useTicketHistory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'ticket-hist-1',
        title: 'Reemplazo terminado',
        closed_at: '2026-07-02T12:00:00Z',
        building: {
          id: 'bld-1',
          name: 'Torre Callao',
          administration: { id: 'adm-1', company_name: 'Admin SA' },
        },
      }),
    ]);
  });
});
