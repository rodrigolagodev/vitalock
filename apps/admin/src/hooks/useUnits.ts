import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unitsKey } from '@/lib/queryKeys';

export interface UnitRow {
  id: string;
  number: string;
  unit_type: string | null;
  status: string;
  is_administrative: boolean;
  building_id: string;
}

export function useUnits(buildingId: string) {
  return useQuery({
    queryKey: unitsKey(buildingId),
    queryFn: async (): Promise<UnitRow[]> => {
      const { data, error } = await supabase
        .from('units')
        .select('id, number, unit_type, status, is_administrative, building_id')
        .eq('building_id', buildingId)
        .order('number');

      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(buildingId),
  });
}
