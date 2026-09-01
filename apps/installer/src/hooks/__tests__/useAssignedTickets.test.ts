import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockStaffId = 'staff-bruno-001';
vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({
    staff: { id: mockStaffId, full_name: 'Bruno', role: 'installer', status: 'active' },
  }),
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Hoisted channel tracking + `.from()` call recording
const { removeChannelMock, channels, fromCalls } = vi.hoisted(() => {
  const removeChannelMock = vi.fn().mockResolvedValue(undefined);
  const channels: Array<{ name: string; filterArg?: unknown; subscribeCb?: (status: string, err?: unknown) => void }> = [];
  const fromCalls: Array<{ schema: string | null; from: string }> = [];
  return { removeChannelMock, channels, fromCalls };
});

vi.mock('@/lib/supabase', () => {
  // View-shaped rows returned by support.installer_tickets_with_context
  const mockViewRows = [
    {
      id: 'ticket-1',
      description: 'Cambio de cerradura',
      status: 'open',
      category: 'maintain_equipment',
      opened_at: '2026-08-09T09:00:00Z',
      building_id: 'bld-1',
      building_name: 'Torre Callao',
      building_address: 'Callao 100',
      building_city: 'CABA',
      building_administration_id: 'adm-1',
      administration_company_name: 'Admin SA',
      administration_address: 'Av. Corrientes 1',
      pending_new_serial: null,
      pending_new_model: null,
      technical_order_item_id: null,
      equipment_id: null,
    },
  ];

  const viewChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: mockViewRows, error: null }),
  };

  // Empty chain used for enrichment queries (equipment_updates, technical_order_items, products)
  const emptyChain = {
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
            if (table === 'installer_tickets_with_context') {
              return { select: vi.fn().mockReturnValue(viewChain) };
            }
            return { select: vi.fn().mockReturnValue(emptyChain) };
          }),
        };
      }),
      from: vi.fn().mockImplementation((table: string) => {
        fromCalls.push({ schema: null, from: table });
        return { select: vi.fn().mockReturnValue(emptyChain) };
      }),
      channel: vi.fn().mockImplementation((name: string) => {
        const entry: { name: string; filterArg?: unknown; subscribeCb?: (status: string, err?: unknown) => void } = { name };
        channels.push(entry);
        return {
          on: vi.fn().mockImplementation((_event: string, filter: unknown) => {
            entry.filterArg = filter;
            return {
              subscribe: vi.fn((cb?: (status: string, err?: unknown) => void) => {
                if (cb) entry.subscribeCb = cb;
              }),
            };
          }),
        };
      }),
      removeChannel: removeChannelMock,
    },
  };
});

import { useAssignedTickets } from '../useAssignedTickets';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

describe('useAssignedTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channels.length = 0;
    fromCalls.length = 0;
  });

  it('base query hits support.installer_tickets_with_context (single view call, no batch stitching)', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The tickets base query goes through the view
    const viewCalls = fromCalls.filter(
      (c) => c.schema === 'support' && c.from === 'installer_tickets_with_context',
    );
    expect(viewCalls).toHaveLength(1);

    // No batch stitching on public.buildings or public.administrations
    const stitchingCalls = fromCalls.filter(
      (c) => c.schema === null && (c.from === 'buildings' || c.from === 'administrations'),
    );
    expect(stitchingCalls).toHaveLength(0);
  });

  it('reshapes flat building_* / administration_* view columns into the nested building/administration shape consumers expect', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'ticket-1',
        building: expect.objectContaining({
          id: 'bld-1',
          name: 'Torre Callao',
          administration: expect.objectContaining({ id: 'adm-1', company_name: 'Admin SA' }),
        }),
      }),
    ]);
  });

  it('3.3a query key contains staff.id (scoping contract)', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData(['assigned-tickets', mockStaffId]);
    expect(cached).toBeDefined();
    expect(Array.isArray(cached)).toBe(true);
  });

  it('3.3b removeChannel called on unmount (cleanup contract)', async () => {
    const { Wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    unmount();

    expect(removeChannelMock).toHaveBeenCalled();
  });

  it('3.3c realtime subscription still targets support.tickets after view migration', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(channels.length).toBeGreaterThanOrEqual(1));

    const primary = channels[0];
    const filterArg = primary?.filterArg as Record<string, unknown> | undefined;
    // Confirm the realtime source table is unchanged (still support.tickets)
    expect(filterArg?.schema).toBe('support');
    expect(filterArg?.table).toBe('tickets');
  });

  it('3.3d CHANNEL_ERROR triggers filterless re-subscription without filter', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(channels.length).toBeGreaterThanOrEqual(1));

    const primaryChannel = channels[0];
    expect(primaryChannel).toBeDefined();

    if (primaryChannel?.subscribeCb) {
      primaryChannel.subscribeCb('CHANNEL_ERROR', new Error('filter rejected'));
    }

    await waitFor(() => expect(channels.length).toBeGreaterThanOrEqual(2));

    const filterlessChannel = channels[1];
    const filterArg = filterlessChannel?.filterArg as Record<string, unknown> | undefined;
    expect(filterArg).not.toHaveProperty('filter');
  });
});
