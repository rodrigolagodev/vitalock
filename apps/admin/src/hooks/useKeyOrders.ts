import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { keyOrdersKey } from '@/lib/queryKeys';

export type KeyOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'ready_for_pickup'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

export interface KeyOrderListRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_full_name: string | null;
  status: KeyOrderStatus;
  created_at: string;
  key_order_items: { id: string }[];
}

export interface UseKeyOrdersFilters {
  search?: string;
  status?: string;
}

export function useKeyOrders({ search, status }: UseKeyOrdersFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: keyOrdersKey(status, trimmed),
    queryFn: async (): Promise<KeyOrderListRow[]> => {
      let query = supabase
        .from('key_orders')
        .select(`
          id,
          order_number,
          client_type,
          administration_id,
          administrations ( company_name ),
          particular_full_name,
          status,
          created_at,
          key_order_items ( id )
        `);

      // Server-side status filter.
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Server-side text search on order_number and particular_full_name.
      if (trimmed) {
        const safe = escapeIlikeValue(trimmed);
        query = query.or(
          `order_number.ilike.%${safe}%,particular_full_name.ilike.%${safe}%`,
        );
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as KeyOrderListRow[];

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
