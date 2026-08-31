import { createUseOrderList } from '@vitalock/shared';
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

export type UseKeyOrdersFilters = Parameters<typeof useKeyOrders>[0];

export const useKeyOrders = createUseOrderList<KeyOrderStatus, KeyOrderListRow>({
  view: 'key_orders_summary',
  itemsTable: 'key_order_items',
  supabase,
  queryKeyFn: keyOrdersKey,
  mapRow: (row, itemsField) => {
    const items = (row[itemsField] as { id: string }[] | undefined) ?? [];
    return {
      id: row.id,
      order_number: row.order_number,
      client_type: row.client_type,
      administration_id: row.administration_id,
      administrations: row.company_name ? { company_name: row.company_name } : null,
      particular_full_name: row.particular_full_name,
      status: row.status as KeyOrderStatus,
      created_at: row.created_at,
      key_order_items: items.map((item) => ({ id: item.id })),
    };
  },
});
