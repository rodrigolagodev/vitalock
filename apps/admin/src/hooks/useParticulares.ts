import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { particularesKey } from '@/lib/queryKeys';
import { useDebounce } from './useDebounce';

export interface ParticularRow {
  id: string;
  unit_id: string;
  dni: string;
  full_name: string;
  phone: string | null;
  email: string | null;
}

const DEBOUNCE_MS = 300;

/**
 * Server-side search over particulares (useAdministrations pattern).
 * The raw input is debounced before it reaches the query key and the
 * PostgREST .or() filter, so typing never fires a request per keystroke.
 */
export function useParticulares({ search }: { search?: string } = {}) {
  const debouncedSearch = useDebounce(search ?? '', DEBOUNCE_MS);
  const trimmed = debouncedSearch.trim();

  return useQuery({
    queryKey: particularesKey(trimmed),
    queryFn: async (): Promise<ParticularRow[]> => {
      let query = supabase
        .from('particulares')
        .select('id, unit_id, dni, full_name, phone, email');

      if (trimmed) {
        query = query.or(
          `full_name.ilike.%${trimmed}%,dni.ilike.%${trimmed}%`,
        );
      }

      const { data, error } = await query.order('full_name');
      if (error) throw error;
      return (data ?? []) as ParticularRow[];
    },
  });
}
