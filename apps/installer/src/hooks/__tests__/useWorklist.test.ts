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

// Mock supabase with channel support
type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | string;
type ChannelCallback = (status: ChannelStatus, err?: unknown) => void;

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

let channelSubscribeCallback: ChannelCallback | null = null;
let filterlessChannelCreated = false;

const removeChannelMock = vi.fn().mockResolvedValue(undefined);

function makeMockChannel(_name: string): MockChannel {
  const ch: MockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb?: ChannelCallback) => {
      if (cb) channelSubscribeCallback = cb;
      return ch;
    }),
  };
  return ch;
}

let primaryChannel: MockChannel;
let filterlessChannel: MockChannel;

// Flat fetch mock data
const mockAuths = [
  {
    id: 'auth-1',
    sync_state: 'pending_install',
    notes: 'nota',
    created_at: '2026-08-09T10:00:00Z',
    equipment_id: 'equip-1',
    rfid_key_id: 'rfid-1',
  },
];
const mockEquipment = [{ id: 'equip-1', description: 'Controladora', building_id: 'bld-1' }];
const mockBuildings = [
  {
    id: 'bld-1',
    name: 'Torre Callao',
    administration_id: 'adm-1',
    administrations: { id: 'adm-1', company_name: 'Admin SA' },
  },
];
const mockRfidKeys = [
  { id: 'rfid-1', rfid_code: 'ABC123', unit_id: 'unit-1', units: { id: 'unit-1', number: '101', unit_type: 'apartment' } },
];

// Build a chainable mock that returns data for the right table
function buildSupabaseMock(embedError: { code: string; message: string } | null) {
  let callCount = 0;

  const selectFn = vi.fn().mockImplementation(() => chain);
  const inFn = vi.fn().mockImplementation(() => {
    callCount++;
    // First call is the nested embed attempt — fail with PGRST200 if embedError
    if (callCount === 1 && embedError) {
      return Promise.resolve({ data: null, error: embedError });
    }
    // Subsequent calls are flat fetch — return mock auths
    return Promise.resolve({ data: mockAuths, error: null });
  });
  const inBldFn = vi.fn().mockResolvedValue({ data: mockBuildings, error: null });
  const inEquipFn = vi.fn().mockImplementation(() => Promise.resolve({ data: mockEquipment, error: null }));
  const inRfidFn = vi.fn().mockResolvedValue({ data: mockRfidKeys, error: null });

  // We need different behavior per from() call
  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === 'key_authorizations') {
      return {
        select: vi.fn().mockReturnThis(),
        in: inFn,
      };
    }
    if (table === 'equipment') {
      return { select: vi.fn().mockReturnThis(), in: inEquipFn };
    }
    if (table === 'buildings') {
      return { select: vi.fn().mockReturnThis(), in: inBldFn };
    }
    if (table === 'rfid_keys') {
      return { select: vi.fn().mockReturnThis(), in: inRfidFn };
    }
    return { select: selectFn, in: inFn };
  });

  const chain = {
    select: selectFn,
    in: inFn,
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };

  primaryChannel = makeMockChannel('primary');
  filterlessChannel = makeMockChannel('filterless');
  let channelCallCount = 0;

  const mockSupa = {
    schema: vi.fn().mockReturnThis(),
    from: fromFn,
    channel: vi.fn().mockImplementation(() => {
      channelCallCount++;
      if (channelCallCount === 1) return primaryChannel;
      filterlessChannelCreated = true;
      return filterlessChannel;
    }),
    removeChannel: removeChannelMock,
  };

  return mockSupa;
}

let mockSupabase = buildSupabaseMock({ code: 'PGRST200', message: 'No FK' });

vi.mock('@/lib/supabase', () => ({ get supabase() { return mockSupabase; } }));

import { useWorklist } from '../useWorklist';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, Wrapper: function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }};
}

describe('useWorklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelSubscribeCallback = null;
    filterlessChannelCreated = false;
    mockSupabase = buildSupabaseMock({ code: 'PGRST200', message: 'No FK' });
  });

  it('3.1 happy path via flat fallback — returns WorklistAuthorization[] with correct building nesting', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWorklist(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data;
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      id: 'auth-1',
      sync_state: 'pending_install',
      equipment: {
        description: 'Controladora',
        building: {
          name: 'Torre Callao',
          administration: { company_name: 'Admin SA' },
        },
      },
      rfid_key: {
        rfid_code: 'ABC123',
        unit: { number: '101' },
      },
    });
  });

  it('3.2 embed PGRST200 triggers flat fallback and resolves equivalent WorklistAuthorization[]', async () => {
    // The mock always returns PGRST200 for first call — so flat fallback runs
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWorklist(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data;
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);
    // Confirm it resolved via flat path — building nesting must be present
    expect(data?.[0]?.equipment.building.name).toBe('Torre Callao');
  });

  it('3.8 CHANNEL_ERROR triggers filterless re-subscription', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useWorklist(), { wrapper: Wrapper });

    // Wait for effect to run (channel subscribed)
    await waitFor(() => expect(primaryChannel.subscribe).toHaveBeenCalled());

    // Simulate CHANNEL_ERROR on the primary (filtered) channel
    if (channelSubscribeCallback) {
      channelSubscribeCallback('CHANNEL_ERROR', new Error('filter rejected'));
    }

    // Filterless channel should be created after CHANNEL_ERROR
    await waitFor(() => expect(filterlessChannelCreated).toBe(true));
    expect(filterlessChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'key_authorizations' }),
      expect.any(Function),
    );
    // Filterless channel must NOT have the sync_state filter
    const filterlessArgs = filterlessChannel.on.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(filterlessArgs).not.toHaveProperty('filter');
  });
});
