import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { equipmentInventoryKey } from '@/lib/queryKeys';

export interface EquipmentInventoryRow {
  id: string | null;
  serial_number: string | null;
  model: string | null;
  status: string | null;
  access_type: string | null;
  building_id: string | null;
  building_name: string | null;
  administration_id: string | null;
  administration_company_name: string | null;
  key_count: number | null;
  key_ids: string[] | null;
  key_labels: string[] | null;
}

export interface UseEquipmentInventoryFilters {
  administrationId?: string;
  buildingId?: string;
  /** equipment status domain value, or 'all' for no filter */
  status?: string;
}

export function useEquipmentInventory({
  administrationId,
  buildingId,
  status,
}: UseEquipmentInventoryFilters = {}) {
  return useQuery({
    queryKey: equipmentInventoryKey(administrationId, buildingId, status),
    queryFn: async (): Promise<EquipmentInventoryRow[]> => {
      let query = supabase
        .from('equipment_inventory')
        .select('*');

      if (administrationId) {
        query = query.eq('administration_id', administrationId);
      }

      if (buildingId) {
        query = query.eq('building_id', buildingId);
      }

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('serial_number', { ascending: true });
      if (error) throw error;

      return (data ?? []) as EquipmentInventoryRow[];
    },
  });
}
