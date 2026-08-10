import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ordensKey } from '@/lib/queryKeys';

export interface OrdenRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_full_name: string | null;
  status: 'draft' | 'in_preparation' | 'ready_for_pickup' | 'completed' | 'cancelled';
  created_at: string;
  order_items: { id: string }[];
}

export interface UseOrdenFilters {
  search?: string;
  status?: string;
}

export function useOrdens({ search, status }: UseOrdenFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: ordensKey(status, trimmed),
    queryFn: async (): Promise<OrdenRow[]> => {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          client_type,
          administration_id,
          administrations ( company_name ),
          particular_full_name,
          status,
          created_at,
          order_items ( id )
        `);

      // Server-side status filter.
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Server-side text search on order_number and particular_full_name.
      if (trimmed) {
        query = query.or(
          `order_number.ilike.%${trimmed}%,particular_full_name.ilike.%${trimmed}%`,
        );
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as OrdenRow[];

      // Client-side filter on embedded administrations.company_name.
      if (trimmed) {
        return rows.filter((row) => {
          if (row.client_type === 'particular') return true; // already filtered server-side
          return row.administrations?.company_name
            .toLowerCase()
            .includes(trimmed.toLowerCase());
        });
      }

      return rows;
    },
  });
}
