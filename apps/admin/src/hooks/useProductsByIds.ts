import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ProductLookupRow {
  id: string;
  name: string;
  category: string;
}

/**
 * Batch lookup of products by ids. Returns a Map keyed by id so callers
 * can resolve names inline without extra fetches. Mirrors the pattern of
 * useEquipmentByIds / useStaffByIds.
 */
export function useProductsByIds(ids: readonly string[]) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const enabled = unique.length > 0;

  return useQuery({
    queryKey: ['admin', 'products', 'by-ids', ...[...unique].sort()],
    queryFn: async (): Promise<Map<string, ProductLookupRow>> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category')
        .in('id', unique);
      if (error) throw error;
      const map = new Map<string, ProductLookupRow>();
      for (const row of data ?? []) {
        map.set(row.id, { id: row.id, name: row.name, category: row.category });
      }
      return map;
    },
    enabled,
  });
}
