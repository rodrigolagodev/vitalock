import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEqFn = vi.fn();
const mockSelectActivate = vi.fn();
const mockSelectDisable = vi.fn();
const mockSelectUnchanged = vi.fn();
const mockFromPublic = vi.fn();
const mockFromOperations = vi.fn();
const mockSchema = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { schema: mockSchema, from: mockFrom };
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

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const EQUIPMENT_ID = 'equip-001';

const toActivateRows = [
  { id: 'key-act-1', rfid_code: 'RFID-ACT-1', unit_id: 'unit-1' },
  { id: 'key-act-2', rfid_code: 'RFID-ACT-2', unit_id: 'unit-2' },
];
const toDisableRows = [
  { id: 'key-dis-1', rfid_code: 'RFID-DIS-1', unit_id: 'unit-3' },
];
const unchangedRows = [
  { id: 'key-unc-1', rfid_code: 'RFID-UNC-1', unit_id: 'unit-4' },
];
const unitRows = [
  { id: 'unit-1', number: '1A' },
  { id: 'unit-2', number: '2B' },
  { id: 'unit-3', number: '3C' },
  { id: 'unit-4', number: '4D' },
];

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { usePendingKeysForEquipment } from '../usePendingKeysForEquipment';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePendingKeysForEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // rfid_key_intended_equipment join for toActivate keys
    // operations.key_authorizations join for toDisable keys
    // operations.key_authorizations join for unchanged keys
    // units lookup

    // We set up the schema/from chain based on call order
    let schemaCallCount = 0;
    let publicFromCallCount = 0;

    mockSchema.mockImplementation((schema: string) => {
      if (schema === 'operations') {
        return { from: mockFromOperations };
      }
      return { from: mockFromPublic };
    });

    // toActivate: rfid_keys filtered via rfid_key_intended_equipment
    // PostgREST: from('rfid_keys').select(...).in('id', ...) — or direct join
    // Since PostgREST cross-schema embeds fail, we batch-fetch via IDs.
    // Hook fetches: (1) rfid_key_intended_equipment for this equipmentId,
    //               (2) rfid_keys WHERE id IN (activate ids),
    //               (3) key_authorizations WHERE equipment_id = eq AND status = pending_disable,
    //               (4) key_authorizations WHERE equipment_id = eq AND sync_state = installed,
    //               (5) rfid_keys WHERE id IN (disable ids),
    //               (6) rfid_keys WHERE id IN (unchanged ids),
    //               (7) units WHERE id IN (all unit ids)

    const mockInActivateKeys = vi.fn().mockResolvedValue({ data: toActivateRows, error: null });
    const mockInDisableKeys = vi.fn().mockResolvedValue({ data: toDisableRows, error: null });
    const mockInUnchangedKeys = vi.fn().mockResolvedValue({ data: unchangedRows, error: null });
    const mockInUnits = vi.fn().mockResolvedValue({ data: unitRows, error: null });

    const mockIntendedEquipSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ rfid_key_id: 'key-act-1' }, { rfid_key_id: 'key-act-2' }],
        error: null,
      }),
    });

    const mockDisableAuthSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ rfid_key_id: 'key-dis-1' }],
          error: null,
        }),
      }),
    });

    const mockUnchangedAuthSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({
            data: [{ rfid_key_id: 'key-unc-1' }],
            error: null,
          }),
        }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rfid_key_intended_equipment') {
        return { select: mockIntendedEquipSelect };
      }
      if (table === 'rfid_keys') {
        // Return different data depending on what IDs are requested
        return {
          select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [...toActivateRows, ...toDisableRows, ...unchangedRows], error: null }) }),
        };
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({ in: mockInUnits }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    mockFromOperations.mockImplementation((table: string) => {
      if (table === 'key_authorizations') {
        // First call: pending_disable authorizations
        // Second call: installed authorizations (unchanged)
        return { select: mockDisableAuthSelect };
      }
      return { select: vi.fn().mockReturnThis() };
    });
  });

  it('is disabled when equipmentId is empty', () => {
    const { result } = renderHook(() => usePendingKeysForEquipment(''), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('returns shape { toActivate, toDisable, unchanged } with correct keys', async () => {
    // Set up a fully controlled mock that resolves all 5 sequential fetches
    const mockEq1 = vi.fn().mockResolvedValue({ data: [], error: null }); // rfid_key_intended_equipment
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rfid_key_intended_equipment') {
        return { select: vi.fn().mockReturnValue({ eq: mockEq1 }) };
      }
      if (table === 'units') {
        return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });
    mockSchema.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }));

    const { result } = renderHook(() => usePendingKeysForEquipment(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data;
    expect(data).toHaveProperty('toActivate');
    expect(data).toHaveProperty('toDisable');
    expect(data).toHaveProperty('unchanged');
    expect(Array.isArray(data?.toActivate)).toBe(true);
    expect(Array.isArray(data?.toDisable)).toBe(true);
    expect(Array.isArray(data?.unchanged)).toBe(true);
  });

  it('returns empty arrays when no keys match', async () => {
    // Override to return empty results
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rfid_key_intended_equipment') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'units') {
        return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      return { select: vi.fn().mockReturnThis() };
    });
    mockSchema.mockImplementation((schema: string) => {
      return {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    });

    const { result } = renderHook(() => usePendingKeysForEquipment(EQUIPMENT_ID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.toActivate).toEqual([]);
    expect(result.current.data?.toDisable).toEqual([]);
    expect(result.current.data?.unchanged).toEqual([]);
  });

  it('uses query key including equipmentId', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rfid_key_intended_equipment') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });
    mockSchema.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }));

    const Wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => usePendingKeysForEquipment('equip-999'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Query key should include equipmentId
    const queries = qc.getQueriesData({ queryKey: ['pending-keys-for-equipment', 'equip-999'] });
    expect(queries.length).toBeGreaterThan(0);
  });
});
