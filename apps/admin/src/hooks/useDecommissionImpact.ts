import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { decommissionImpactKey } from '@/lib/queryKeys';

/**
 * Counts key_authorizations that will be affected when equipment is decommissioned.
 * Only runs when the decommission dialog is open (enabled: true).
 * Uses {count:'exact', head:true} — no rows returned, only the count.
 */
export function useDecommissionImpact(equipmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: decommissionImpactKey(equipmentId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .schema('operations')
        .from('key_authorizations')
        .select('id', { count: 'exact', head: true })
        .eq('equipment_id', equipmentId)
        .in('sync_state', ['pending_install', 'pending_removal']);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: Boolean(equipmentId) && enabled,
  });
}
