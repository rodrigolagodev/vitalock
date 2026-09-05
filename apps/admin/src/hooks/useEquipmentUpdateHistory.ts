import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface EquipmentUpdateHistoryRow {
  id: string;
  created_at: string;
  resolved_at: string;
  resolved_by_staff_id: string | null;
  mdb_storage_path: string;
  keys_to_activate: string[];
  keys_to_disable: string[];
}

const equipmentUpdateHistoryKey = (equipmentId: string) =>
  ['admin', 'equipment-update-history', equipmentId] as const;

/**
 * Fetches all resolved equipment_updates for a given equipment, ordered
 * newest-first. Composes on the same support.equipment_updates table as
 * useEquipmentUpdates but scoped to resolved rows only.
 */
export function useEquipmentUpdateHistory(equipmentId: string) {
  return useQuery({
    queryKey: equipmentUpdateHistoryKey(equipmentId),
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<EquipmentUpdateHistoryRow[]> => {
      if (!equipmentId) return [];

      const { data, error } = await supabase
        .schema('support')
        .from('equipment_updates')
        .select(
          'id, created_at, resolved_at, resolved_by_staff_id, mdb_storage_path, keys_to_activate, keys_to_disable',
        )
        .eq('equipment_id', equipmentId)
        .not('resolved_at', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []) as unknown as EquipmentUpdateHistoryRow[];
    },
  });
}
