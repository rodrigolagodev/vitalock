import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { administrationsKey } from '@/lib/queryKeys';

export interface AdministrationRow {
  id: string;
  company_name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  notes: string | null;
}

export function useAdministrations(
  { search, status }: { search?: string; status?: string } = {},
) {
  return useQuery({
    queryKey: administrationsKey(status, search),
    queryFn: async () => {
      // Build query with filters first, then apply order last
      let query = supabase
        .from('administrations')
        .select('id, company_name, tax_id, email, phone, address, status, notes');

      if (status !== undefined && status !== 'all') {
        query = query.eq('status', status);
      }

      if (search && search.trim() !== '') {
        const safe = escapeIlikeValue(search.trim());
        query = query.or(
          `company_name.ilike.%${safe}%,tax_id.ilike.%${safe}%`,
        );
      }

      const { data, error } = await query.order('company_name');
      if (error) throw error;
      return (data ?? []) as AdministrationRow[];
    },
  });
}
