import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
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
  /** Unit number resolved via the unit embed (display only). */
  unit_number?: string | null;
  /** Building name resolved via the unit → building embed (display only). */
  building_name?: string | null;
  /** Building id resolved via the unit embed (used to prefill the edit form). */
  unit_building_id?: string | null;
}

const DEBOUNCE_MS = 300;

/**
 * Server-side search over particulares (useAdministrations pattern).
 * The raw input is debounced before it reaches the query key and the
 * PostgREST .or() filter, so typing never fires a request per keystroke.
 * Only active particulares are listed (soft-delete via status); the unit
 * number and building name are embedded for table/form display.
 */
export function useParticulares({ search }: { search?: string } = {}) {
  const debouncedSearch = useDebounce(search ?? '', DEBOUNCE_MS);
  const trimmed = debouncedSearch.trim();
  const liveTrimmed = (search ?? '').trim();

  const query = useQuery({
    queryKey: particularesKey(trimmed),
    queryFn: async (): Promise<ParticularRow[]> => {
      let query = supabase
        .from('particulares')
        .select(
          'id, unit_id, dni, full_name, phone, email, ' +
            'units!particulares_unit_id_fkey(number, building_id, buildings!units_building_id_fkey(name))',
        )
        .eq('status', 'active');

      if (trimmed) {
        const safe = escapeIlikeValue(trimmed);
        query = query.or(
          `full_name.ilike.%${safe}%,dni.ilike.%${safe}%`,
        );
      }

      const { data, error } = await query.order('full_name');
      if (error) throw error;

      type ParticularRowWithUnit = ParticularRow & {
        units?: {
          number: string | null;
          building_id: string | null;
          buildings: { name: string | null } | null;
        } | null;
      };

      return ((data ?? []) as unknown as ParticularRowWithUnit[]).map((row) => {
        const { units, ...rest } = row;
        return {
          ...rest,
          unit_number: units?.number ?? null,
          building_name: units?.buildings?.name ?? null,
          unit_building_id: units?.building_id ?? null,
        };
      });
    },
  });

  return {
    ...query,
    // True while the debounce has not caught up with the live input. During
    // this window `query.data` still belongs to the previous term — callers
    // must not render it as if it matched the current search.
    isSearchPending: liveTrimmed !== trimmed,
  };
}
