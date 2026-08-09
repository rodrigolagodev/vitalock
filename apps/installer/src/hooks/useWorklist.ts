import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/auth/AuthProvider';
import { worklistKey } from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorklistAuthorization {
  id: string;
  sync_state: 'pending_install' | 'pending_removal';
  notes: string | null;
  created_at: string;
  equipment: {
    id: string;
    description: string;
    building: {
      id: string;
      name: string;
      administration: { id: string; company_name: string };
    };
  };
  rfid_key: {
    id: string;
    rfid_code: string;
    unit: { id: string; number: string; unit_type: string | null };
  };
}

// ---------------------------------------------------------------------------
// Zod guard — used to detect bad building path from nested embed
// ---------------------------------------------------------------------------

const BuildingPathSchema = z.object({
  id: z.string(),
  name: z.string(),
  administration: z.object({ id: z.string(), company_name: z.string() }),
});

// ---------------------------------------------------------------------------
// Fetcher — attempts nested embed first; falls back to two-step flat fetch
//
// SMOKE-TEST FINDING (Phase 4.1, 2026-08-09):
//   The cross-schema FK operations.equipment.building_id → public.buildings is
//   NOT exposed in PostgREST's schema cache for this project. The nested embed
//   always returns PGRST200. The two-step flat fetch is therefore the PRIMARY
//   code path. The nested embed attempt is retained so the hook auto-upgrades
//   if the FK is ever exposed, but callers should expect the fallback to always
//   fire in the current deployment.
//
// Realtime fallback (CHANNEL_ERROR):
//   If the filter `sync_state=in.(pending_install,pending_removal)` is rejected,
//   the channel re-subscribes without a filter. invalidateQueries fires on ANY
//   event; the query's own .in() clause filters the fetched data.
// ---------------------------------------------------------------------------

const PGRST_EMBED_ERRORS = new Set(['PGRST100', 'PGRST200', 'PGRST201']);

async function fetchWorklist(): Promise<WorklistAuthorization[]> {
  // Attempt 1: nested embed
  const { data: embedData, error: embedError } = await supabase
    .schema('operations')
    .from('key_authorizations')
    .select(`
      id,
      sync_state,
      notes,
      created_at,
      equipment:equipment_id(
        id,
        description,
        building:building_id(
          id,
          name,
          administration:administration_id(id, company_name)
        )
      ),
      rfid_key:rfid_key_id(
        id,
        rfid_code,
        unit:unit_id(id, number, unit_type)
      )
    `)
    .in('sync_state', ['pending_install', 'pending_removal']);

  if (!embedError) {
    // Validate that the building path resolved correctly
    const allValid = (embedData ?? []).every((row) => {
      const parsed = BuildingPathSchema.safeParse(
        (row as unknown as { equipment?: { building?: unknown } }).equipment?.building,
      );
      return parsed.success;
    });

    if (allValid) {
      return (embedData ?? []) as unknown as WorklistAuthorization[];
    }
  }

  // Fallback triggered by: PGRST100/200/201, null building path, or embed error
  if (embedError && !PGRST_EMBED_ERRORS.has(embedError.code)) {
    // Non-embed error (e.g. network, auth) — propagate
    throw embedError;
  }

  // Attempt 2: flat fetch + client-side join
  return fetchWorklistFlat();
}

async function fetchWorklistFlat(): Promise<WorklistAuthorization[]> {
  // Step 1: fetch raw key_authorizations
  const { data: auths, error: authsError } = await supabase
    .schema('operations')
    .from('key_authorizations')
    .select('id, sync_state, notes, created_at, equipment_id, rfid_key_id')
    .in('sync_state', ['pending_install', 'pending_removal']);

  if (authsError) throw authsError;
  if (!auths || auths.length === 0) return [];

  const equipmentIds = [...new Set(auths.map((a) => a.equipment_id))];
  const rfidKeyIds = [...new Set(auths.map((a) => a.rfid_key_id))];

  // Step 2a: fetch equipment rows
  const { data: equipRows, error: equipError } = await supabase
    .schema('operations')
    .from('equipment')
    .select('id, description, building_id')
    .in('id', equipmentIds);
  if (equipError) throw equipError;

  const buildingIds = [
    ...new Set((equipRows ?? []).map((e) => e.building_id)),
  ];

  // Step 2b: fetch buildings + administrations
  const { data: buildingRows, error: buildingError } = await supabase
    .from('buildings')
    .select('id, name, administration_id, administrations:administration_id(id, company_name)')
    .in('id', buildingIds);
  if (buildingError) throw buildingError;

  // Step 2c: fetch rfid_keys
  const { data: rfidRows, error: rfidError } = await supabase
    .from('rfid_keys')
    .select('id, rfid_code, unit_id, units:unit_id(id, number, unit_type)')
    .in('id', rfidKeyIds);
  if (rfidError) throw rfidError;

  // Build lookup maps
  type BuildingWithAdmin = {
    id: string;
    name: string;
    administration_id: string;
    administrations: { id: string; company_name: string } | null;
  };
  const buildingMap = new Map<string, BuildingWithAdmin>(
    (buildingRows ?? []).map((b) => [b.id, b as unknown as BuildingWithAdmin]),
  );

  type EquipRow = { id: string; description: string; building_id: string };
  const equipMap = new Map<string, EquipRow>(
    (equipRows ?? []).map((e) => [e.id, e as EquipRow]),
  );

  type RfidRow = {
    id: string;
    rfid_code: string;
    unit_id: string;
    units: { id: string; number: string; unit_type: string | null } | null;
  };
  const rfidMap = new Map<string, RfidRow>(
    (rfidRows ?? []).map((r) => [r.id, r as unknown as RfidRow]),
  );

  // Join
  const result: WorklistAuthorization[] = [];
  for (const auth of auths) {
    const equip = equipMap.get(auth.equipment_id);
    const rfid = rfidMap.get(auth.rfid_key_id);
    if (!equip || !rfid) continue;

    const building = buildingMap.get(equip.building_id);
    if (!building || !building.administrations) continue;

    result.push({
      id: auth.id,
      sync_state: auth.sync_state as 'pending_install' | 'pending_removal',
      notes: auth.notes,
      created_at: auth.created_at,
      equipment: {
        id: equip.id,
        description: equip.description,
        building: {
          id: building.id,
          name: building.name,
          administration: {
            id: building.administrations.id,
            company_name: building.administrations.company_name,
          },
        },
      },
      rfid_key: {
        id: rfid.id,
        rfid_code: rfid.rfid_code,
        unit: rfid.units
          ? {
              id: rfid.units.id,
              number: rfid.units.number,
              unit_type: rfid.units.unit_type,
            }
          : { id: '', number: '', unit_type: null },
      },
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorklist(): UseQueryResult<WorklistAuthorization[]> {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  const query = useQuery({
    queryKey: worklistKey(staffId),
    queryFn: fetchWorklist,
    enabled: !!staffId,
  });

  useEffect(() => {
    if (!staffId) return;

    let channel = supabase
      .channel('worklist-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'operations',
          table: 'key_authorizations',
          filter: 'sync_state=in.(pending_install,pending_removal)',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: worklistKey(staffId) });
        },
      );

    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn(
          '[useWorklist] Realtime filter rejected, re-subscribing filterless. Error:',
          err,
        );
        void supabase.removeChannel(channel);

        // Re-subscribe without filter
        channel = supabase
          .channel('worklist-realtime-filterless')
          .on(
            'postgres_changes',
            { event: '*', schema: 'operations', table: 'key_authorizations' },
            () => {
              void queryClient.invalidateQueries({ queryKey: worklistKey(staffId) });
            },
          )
          .subscribe();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffId, queryClient]);

  return query;
}
