import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { equipmentByBuildingKey } from '@/lib/queryKeys';

export interface EquipmentByBuildingRow {
  id: string;
  serial_number: string;
  model: string | null;
  building_id: string;
}

export function useEquipmentByBuilding(
  buildingId?: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
) {
  return useQuery({
    queryKey: [...equipmentByBuildingKey(buildingId), activeOnly ? 'active' : 'all'],
    queryFn: async (): Promise<EquipmentByBuildingRow[]> => {
      let query = supabase
        .from('equipment_inventory')
        .select('id, serial_number, model, building_id, status')
        .eq('building_id', buildingId!);

      if (activeOnly) {
        query = query.eq('status', 'active');
      }

      const { data, error } = await query.order('serial_number', { ascending: true });

      if (error) throw error;

      return (data ?? []) as EquipmentByBuildingRow[];
    },
    enabled: Boolean(buildingId),
  });
}
