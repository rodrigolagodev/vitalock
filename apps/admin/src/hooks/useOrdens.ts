import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ordensKey } from '@/lib/queryKeys';

export type OrderType = 'keys' | 'technical';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'ready_for_pickup'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

export interface OrdenRow {
  id: string;
  order_number: string;
  order_type: OrderType;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_full_name: string | null;
  status: OrderStatus;
  created_at: string;
  order_items: { id: string }[];
}

export interface UseOrdenFilters {
  search?: string;
  status?: string;
  orderType?: OrderType | 'all';
}

export function useOrdens({ search, status, orderType }: UseOrdenFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: ordensKey(status, trimmed, orderType),
    queryFn: async (): Promise<OrdenRow[]> => {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_type,
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

      if (orderType && orderType !== 'all') {
        query = query.eq('order_type', orderType);
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
