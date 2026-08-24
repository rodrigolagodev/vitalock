import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { equipmentByIdsKey } from '@/lib/queryKeys';

export interface EquipmentLookupRow {
  id: string;
  serial_number: string;
  model: string | null;
}

export function useEquipmentByIds(ids: readonly string[]) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const enabled = unique.length > 0;

  return useQuery({
    queryKey: equipmentByIdsKey(unique),
    queryFn: async (): Promise<Map<string, EquipmentLookupRow>> => {
      const { data, error } = await supabase
        .schema('operations')
        .from('equipment')
        .select('id, serial_number, model')
        .in('id', unique);
      if (error) throw error;
      const map = new Map<string, EquipmentLookupRow>();
      for (const row of data ?? []) {
        map.set(row.id, {
          id: row.id,
          serial_number: row.serial_number,
          model: row.model,
        });
      }
      return map;
    },
    enabled,
  });
}
