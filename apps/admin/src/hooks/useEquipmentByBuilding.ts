import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { equipmentByBuildingKey } from '@/lib/queryKeys';

export interface EquipmentByBuildingRow {
  id: string;
  serial_number: string;
  model: string | null;
  building_id: string;
}

export function useEquipmentByBuilding(buildingId?: string) {
  return useQuery({
    queryKey: equipmentByBuildingKey(buildingId),
    queryFn: async (): Promise<EquipmentByBuildingRow[]> => {
      const { data, error } = await supabase
        .from('equipment_inventory')
        .select('id, serial_number, model, building_id')
        .eq('building_id', buildingId!)
        .order('serial_number', { ascending: true });

      if (error) throw error;

      return (data ?? []) as EquipmentByBuildingRow[];
    },
    enabled: Boolean(buildingId),
  });
}
