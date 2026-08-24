import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildingsByIdsKey } from '@/lib/queryKeys';

export interface BuildingLookupRow {
  id: string;
  name: string;
}

export function useBuildingsByIds(ids: readonly string[]) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const enabled = unique.length > 0;

  return useQuery({
    queryKey: buildingsByIdsKey(unique),
    queryFn: async (): Promise<Map<string, BuildingLookupRow>> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name')
        .in('id', unique);
      if (error) throw error;
      const map = new Map<string, BuildingLookupRow>();
      for (const row of data ?? []) {
        map.set(row.id, { id: row.id, name: row.name });
      }
      return map;
    },
    enabled,
  });
}
