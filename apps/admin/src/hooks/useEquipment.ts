import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { equipmentKey } from '@/lib/queryKeys';

export interface EquipmentRow {
  id: string;
  model: string | null;
  serial_number: string;
  status: string;
  installed_at: string;
  building_id: string;
}

export function useEquipment(buildingId: string) {
  return useQuery({
    queryKey: equipmentKey(buildingId),
    queryFn: async (): Promise<EquipmentRow[]> => {
      const { data, error } = await supabase
        .schema('operations')
        .from('equipment')
        .select('id, model, serial_number, status, installed_at, building_id')
        .eq('building_id', buildingId)
        .order('serial_number');

      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(buildingId),
  });
}
