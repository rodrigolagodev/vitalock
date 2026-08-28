import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface PendingKey {
  id: string;
  rfid_code: string;
  unit_number: string | null;
}

export interface PendingKeysForEquipment {
  /** Keys with status='pending_installation' linked to this equipment via rfid_key_intended_equipment */
  toActivate: PendingKey[];
  /** Keys with status='pending_disable' that have a key_authorization for this equipment */
  toDisable: PendingKey[];
  /** Keys with status='active', sync_state='installed', removed_at=null for this equipment */
  unchanged: PendingKey[];
}

export function usePendingKeysForEquipment(equipmentId: string) {
  return useQuery({
    queryKey: ['pending-keys-for-equipment', equipmentId] as const,
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<PendingKeysForEquipment> => {
      if (!equipmentId) {
        return { toActivate: [], toDisable: [], unchanged: [] };
      }

      // -----------------------------------------------------------------------
      // (1) toActivate: keys with status='pending_installation' linked via
      //     rfid_key_intended_equipment for this equipment.
      //     PostgREST cross-schema embeds fail (PGRST200), so we batch-fetch.
      // -----------------------------------------------------------------------
      const { data: intendedLinks, error: intendedErr } = await supabase
        .from('rfid_key_intended_equipment')
        .select('rfid_key_id')
        .eq('equipment_id', equipmentId);

      if (intendedErr) throw intendedErr;

      const activateKeyIds = (intendedLinks ?? []).map((r) => (r as { rfid_key_id: string }).rfid_key_id);

      // -----------------------------------------------------------------------
      // (2) toDisable: keys with status='pending_disable' whose key_authorization
      //     on this equipment is still installed. `pending_disable` is set at
      //     request time (via request_key_disable); the authorization stays at
      //     sync_state='installed' until the update RPC processes the disable.
      //     So the correct filter is sync_state='installed', not 'pending_removal'.
      // -----------------------------------------------------------------------
      const { data: disableAuths, error: disableErr } = await supabase
        .schema('operations')
        .from('key_authorizations')
        .select('rfid_key_id')
        .eq('equipment_id', equipmentId)
        .eq('sync_state', 'installed');

      if (disableErr) throw disableErr;

      const disableKeyIds = (disableAuths ?? []).map((r) => (r as { rfid_key_id: string }).rfid_key_id);

      // -----------------------------------------------------------------------
      // (3) unchanged: keys with sync_state='installed' and removed_at=null
      //     in key_authorizations for this equipment.
      // -----------------------------------------------------------------------
      const { data: unchangedAuths, error: unchangedErr } = await supabase
        .schema('operations')
        .from('key_authorizations')
        .select('rfid_key_id')
        .eq('equipment_id', equipmentId)
        .eq('sync_state', 'installed')
        .is('removed_at', null);

      if (unchangedErr) throw unchangedErr;

      const unchangedKeyIds = (unchangedAuths ?? []).map((r) => (r as { rfid_key_id: string }).rfid_key_id);

      // -----------------------------------------------------------------------
      // Batch-fetch all rfid_keys
      // -----------------------------------------------------------------------
      const allKeyIds = [...new Set([...activateKeyIds, ...disableKeyIds, ...unchangedKeyIds])];

      let keyMap = new Map<string, { id: string; rfid_code: string; unit_id: string | null; status: string }>();
      if (allKeyIds.length > 0) {
        const { data: keys, error: keysErr } = await supabase
          .from('rfid_keys')
          .select('id, rfid_code, unit_id, status')
          .in('id', allKeyIds);

        if (keysErr) throw keysErr;

        for (const k of keys ?? []) {
          const key = k as { id: string; rfid_code: string; unit_id: string | null; status: string };
          keyMap.set(key.id, key);
        }
      }

      // -----------------------------------------------------------------------
      // Batch-fetch units for unit_number lookup
      // -----------------------------------------------------------------------
      const allUnitIds = [
        ...new Set(
          [...keyMap.values()]
            .map((k) => k.unit_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const unitMap = new Map<string, string>();
      if (allUnitIds.length > 0) {
        const { data: units, error: unitsErr } = await supabase
          .from('units')
          .select('id, number')
          .in('id', allUnitIds);

        if (unitsErr) throw unitsErr;

        for (const u of units ?? []) {
          const unit = u as { id: string; number: string };
          unitMap.set(unit.id, unit.number);
        }
      }

      // -----------------------------------------------------------------------
      // Build result groups, filtering by actual rfid_keys.status
      // -----------------------------------------------------------------------
      const toKey = (id: string): PendingKey | null => {
        const k = keyMap.get(id);
        if (!k) return null;
        return {
          id: k.id,
          rfid_code: k.rfid_code,
          unit_number: k.unit_id ? (unitMap.get(k.unit_id) ?? null) : null,
        };
      };

      const toActivate = activateKeyIds
        .map(toKey)
        .filter((k): k is PendingKey => k !== null && keyMap.get(k.id)?.status === 'pending_installation');

      const toDisable = disableKeyIds
        .map(toKey)
        .filter((k): k is PendingKey => k !== null && keyMap.get(k.id)?.status === 'pending_disable');

      const unchanged = unchangedKeyIds
        .map(toKey)
        .filter((k): k is PendingKey => k !== null && keyMap.get(k.id)?.status === 'active');

      return { toActivate, toDisable, unchanged };
    },
  });
}
