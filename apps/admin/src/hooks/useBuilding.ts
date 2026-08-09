import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildingKey } from '@/lib/queryKeys';
import type { BuildingRow } from './useBuildings';

export function useBuilding(buildingId: string) {
  return useQuery({
    queryKey: buildingKey(buildingId),
    queryFn: async (): Promise<BuildingRow | null> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, address, status, administration_id')
        .eq('id', buildingId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        address: data.address,
        status: data.status,
        administration_id: data.administration_id,
        unit_count: 0,
        equipment_count: 0,
      };
    },
    enabled: Boolean(buildingId),
  });
}
