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
}));

// Hoisted channel tracking
const { removeChannelMock, channels } = vi.hoisted(() => {
  const removeChannelMock = vi.fn().mockResolvedValue(undefined);
  const channels: Array<{ name: string; filterArg?: unknown; subscribeCb?: (status: string, err?: unknown) => void }> = [];
  return { removeChannelMock, channels };
});

vi.mock('@/lib/supabase', () => {
  const mockTickets = [
    {
      id: 'ticket-1',
      description: 'Cambio de cerradura',
      status: 'open',
      opened_at: '2026-08-09T09:00:00Z',
      building: {
        id: 'bld-1',
        name: 'Torre Callao',
        administration: { id: 'adm-1', company_name: 'Admin SA' },
      },
    },
  ];

  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: mockTickets, error: null }),
  };

  return {
    supabase: {
      schema: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) }),
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
  });

  it('3.3a query key contains staff.id (scoping contract)', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Query stored with key containing the staff ID
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

  it('3.3c CHANNEL_ERROR triggers filterless re-subscription without filter', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useAssignedTickets(), { wrapper: Wrapper });

    // Wait for initial channel subscription
    await waitFor(() => expect(channels.length).toBeGreaterThanOrEqual(1));

    const primaryChannel = channels[0];
    expect(primaryChannel).toBeDefined();

    // Trigger CHANNEL_ERROR on the primary channel
    if (primaryChannel?.subscribeCb) {
      primaryChannel.subscribeCb('CHANNEL_ERROR', new Error('filter rejected'));
    }

    // A second channel (filterless) should be created
    await waitFor(() => expect(channels.length).toBeGreaterThanOrEqual(2));

    const filterlessChannel = channels[1];
    const filterArg = filterlessChannel?.filterArg as Record<string, unknown> | undefined;
    // Filterless channel must NOT have a filter property
    expect(filterArg).not.toHaveProperty('filter');
  });
});
