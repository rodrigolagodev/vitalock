import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { allOrdersKey } from '@/lib/queryKeys';

/** Discriminator from the public.all_orders UNION ALL VIEW. */
export type AllOrderKind = 'key' | 'technical';

export interface AllOrderRow {
  id: string;
  order_number: string;
  order_kind: AllOrderKind;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  particular_id: string | null;
  particular_full_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseAllOrdersFilters {
  search?: string;
  status?: string;
  orderKind?: AllOrderKind | 'all';
}

/**
 * Read-only list hook over the public.all_orders VIEW.
 * Used by the /historial module. Never write through this hook.
 */
export function useAllOrders({ search, status, orderKind }: UseAllOrdersFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: allOrdersKey(status, trimmed, orderKind),
    queryFn: async (): Promise<AllOrderRow[]> => {
      let query = supabase
        .from('all_orders')
        .select(
          'id, order_number, order_kind, client_type, administration_id, particular_id, particular_full_name, status, notes, created_at, updated_at',
        );

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (orderKind && orderKind !== 'all') {
        query = query.eq('order_kind', orderKind);
      }

      if (trimmed) {
        const safe = escapeIlikeValue(trimmed);
        query = query.or(
          `order_number.ilike.%${safe}%,particular_full_name.ilike.%${safe}%`,
        );
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []) as unknown as AllOrderRow[];
    },
  });
}
