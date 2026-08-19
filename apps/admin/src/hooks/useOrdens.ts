import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { ordensKey } from '@/lib/queryKeys';

// Legacy alias: the old table used 'keys'/'technical'; the all_orders VIEW uses 'key'/'technical'.
// Components that consume this hook inspect order_type for display; we map at the boundary.
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
  /** Legacy field kept for consumer compat. Derived from all_orders.order_kind. */
  order_type: OrderType;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_full_name: string | null;
  status: OrderStatus;
  created_at: string;
  /**
   * Item stubs — always an empty array when sourced from all_orders VIEW (VIEW
   * does not embed items). Kept for legacy consumer compat (OrdenesTable.tsx
   * uses .length). Will be removed when OrdenesTable is retired in PR-7.
   */
  order_items: { id: string }[];
}

export interface UseOrdenFilters {
  search?: string;
  status?: string;
  orderType?: OrderType | 'all';
}

/** Maps the all_orders VIEW order_kind ('key'/'technical') to the legacy order_type ('keys'/'technical'). */
function toOrderType(orderKind: string): OrderType {
  return orderKind === 'key' ? 'keys' : 'technical';
}

export function useOrdens({ search, status, orderType }: UseOrdenFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: ordensKey(status, trimmed, orderType),
    queryFn: async (): Promise<OrdenRow[]> => {
      let query = supabase
        .from('all_orders')
        .select(`
          id,
          order_number,
          order_kind,
          client_type,
          administration_id,
          administrations ( company_name ),
          particular_full_name,
          status,
          created_at
        `);

      // Server-side status filter.
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Map legacy orderType ('keys'/'technical') to all_orders order_kind ('key'/'technical').
      if (orderType && orderType !== 'all') {
        const kind = orderType === 'keys' ? 'key' : 'technical';
        query = query.eq('order_kind', kind);
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

      const rows = (data ?? []) as unknown as Array<{
        id: string;
        order_number: string;
        order_kind: string;
        client_type: 'administration' | 'particular';
        administration_id: string | null;
        administrations: { company_name: string } | null;
        particular_full_name: string | null;
        status: OrderStatus;
        created_at: string;
      }>;

      // Map order_kind → order_type for backward compat. Client-side filter on admin name.
      // order_items is always [] here — the all_orders VIEW does not embed items.
      const mapped: OrdenRow[] = rows.map((row) => ({
        ...row,
        order_type: toOrderType(row.order_kind),
        order_items: [],
      }));

      if (trimmed) {
        return mapped.filter((row) => {
          if (row.client_type === 'particular') return true;
          return row.administrations?.company_name
            .toLowerCase()
            .includes(trimmed.toLowerCase());
        });
      }

      return mapped;
    },
  });
}
