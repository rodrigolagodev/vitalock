import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger, useAuthContext } from '@vitalock/shared';
import { worklistKey } from '@/lib/queryKeys';

const log = logger('useWorklist');

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

/**
 * Full shape of one embedded row. The nested embed below crosses schemas
 * (`operations.key_authorizations` → `public.buildings`), a relationship
 * PostgREST does not expose in this project's schema cache, so the generated
 * types cannot describe the result. Rather than assert the shape, the whole
 * row is parsed by Zod before it is trusted — the fallback path already
 * treats a failed parse as "use the flat fetch", so validation costs nothing
 * and removes the only place where an unchecked shape could enter the hook.
 */
const EmbeddedAuthorizationSchema = z.object({
  id: z.string(),
  sync_state: z.union([z.literal('pending_install'), z.literal('pending_removal')]),
  notes: z.string().nullable(),
  created_at: z.string(),
  equipment: z.object({
    id: z.string(),
    description: z.string(),
    building: BuildingPathSchema,
  }),
  rfid_key: z.object({
    id: z.string(),
    rfid_code: z.string(),
    unit: z.object({
      id: z.string(),
      number: z.string(),
      unit_type: z.string().nullable(),
    }),
  }),
}) satisfies z.ZodType<WorklistAuthorization>;

/**
 * Shapes for the flat-fetch fallback embeds.
 *
 * `buildings` and `rfid_keys` are selected with the `alias:fk_column(...)`
 * embed form. PostgREST resolves it at runtime, but supabase-js's select-string
 * parser reads the part after `:` as the target relation and so types these
 * columns as `SelectQueryError`. The generated types therefore cannot describe
 * the result — parse it instead of asserting it. A row that fails to parse is
 * dropped, which lands on the same `continue` branch the join below already
 * takes for a missing building or key.
 */
const BuildingWithAdminSchema = z.object({
  id: z.string(),
  name: z.string(),
  administration_id: z.string(),
  administrations: z.object({ id: z.string(), company_name: z.string() }).nullable(),
});

const RfidKeyWithUnitSchema = z.object({
  id: z.string(),
  rfid_code: z.string(),
  unit_id: z.string(),
  units: z
    .object({ id: z.string(), number: z.string(), unit_type: z.string().nullable() })
    .nullable(),
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
    .select(
      `
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
    `,
    )
    .in('sync_state', ['pending_install', 'pending_removal']);

  if (!embedError) {
    // Validate the embed result — most importantly that the cross-schema
    // building path resolved rather than coming back null.
    const parsed = z.array(EmbeddedAuthorizationSchema).safeParse(embedData ?? []);
    if (parsed.success) {
      return parsed.data;
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

  const buildingIds = [...new Set((equipRows ?? []).map((e) => e.building_id))];

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

  // Build lookup maps. `equipment` selects plain columns, so its element type
  // comes straight from the generated types; the two embed queries are parsed.
  const equipMap = new Map((equipRows ?? []).map((e) => [e.id, e] as const));

  const buildingMap = new Map<string, z.infer<typeof BuildingWithAdminSchema>>();
  for (const row of buildingRows ?? []) {
    const parsed = BuildingWithAdminSchema.safeParse(row);
    if (parsed.success) buildingMap.set(parsed.data.id, parsed.data);
  }

  const rfidMap = new Map<string, z.infer<typeof RfidKeyWithUnitSchema>>();
  for (const row of rfidRows ?? []) {
    const parsed = RfidKeyWithUnitSchema.safeParse(row);
    if (parsed.success) rfidMap.set(parsed.data.id, parsed.data);
  }

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

    let channel = supabase.channel('worklist-realtime').on(
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
        log.warn('Realtime filter rejected, re-subscribing filterless.', err);
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
