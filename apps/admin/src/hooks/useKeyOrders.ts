import { useQuery } from '@tanstack/react-query';
import { escapeIlikeValue } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { keyOrdersKey } from '@/lib/queryKeys';

export type KeyOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'pending_installation'
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
  administrationId?: string;
  buildingId?: string;
}

export function useKeyOrders({
  search,
  status,
  administrationId,
  buildingId,
}: UseKeyOrdersFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: keyOrdersKey(status, trimmed, administrationId, buildingId),
    queryFn: async (): Promise<KeyOrderListRow[]> => {
      let orderIdsWithBuilding: string[] | null = null;
      if (buildingId && buildingId !== 'all') {
        const { data: itemsMatch, error: itemsError } = await supabase
          .from('key_order_items')
          .select('order_id')
          .eq('building_id', buildingId);
        if (itemsError) throw itemsError;
        orderIdsWithBuilding = Array.from(
          new Set((itemsMatch ?? []).map((r) => r.order_id)),
        );
        if (orderIdsWithBuilding.length === 0) return [];
      }

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

      // Server-side administration filter.
      if (administrationId && administrationId !== 'all') {
        query = query.eq('administration_id', administrationId);
      }

      if (orderIdsWithBuilding) {
        query = query.in('id', orderIdsWithBuilding);
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
