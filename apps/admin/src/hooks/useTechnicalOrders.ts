import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { technicalOrdersKey } from '@/lib/queryKeys';

export type TechnicalOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

export interface TechnicalOrderListRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_full_name: string | null;
  status: TechnicalOrderStatus;
  created_at: string;
  technical_order_items: { id: string }[];
}

export interface UseTechnicalOrdersFilters {
  search?: string;
  status?: string;
}

export function useTechnicalOrders({ search, status }: UseTechnicalOrdersFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: technicalOrdersKey(status, trimmed),
    queryFn: async (): Promise<TechnicalOrderListRow[]> => {
      let query = supabase
        .from('technical_orders')
        .select(`
          id,
          order_number,
          client_type,
          administration_id,
          administrations ( company_name ),
          particular_full_name,
          status,
          created_at,
          technical_order_items ( id )
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

      const rows = (data ?? []) as unknown as TechnicalOrderListRow[];

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
