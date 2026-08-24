import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { staffByIdsKey } from '@/lib/queryKeys';

export interface StaffLookupRow {
  id: string;
  full_name: string;
}

export function useStaffByIds(ids: readonly string[]) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const enabled = unique.length > 0;

  return useQuery({
    queryKey: staffByIdsKey(unique),
    queryFn: async (): Promise<Map<string, StaffLookupRow>> => {
      const { data, error } = await supabase
        .schema('identity')
        .from('staff')
        .select('id, full_name')
        .in('id', unique);
      if (error) throw error;
      const map = new Map<string, StaffLookupRow>();
      for (const row of data ?? []) {
        map.set(row.id, { id: row.id, full_name: row.full_name });
      }
      return map;
    },
    enabled,
  });
}
