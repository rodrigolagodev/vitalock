import { createUseOrderList } from '@vitalock/shared';
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

export type UseTechnicalOrdersFilters = Parameters<typeof useTechnicalOrders>[0];

export const useTechnicalOrders = createUseOrderList<TechnicalOrderStatus, TechnicalOrderListRow>({
  view: 'technical_orders_summary',
  itemsTable: 'technical_order_items',
  supabase,
  queryKeyFn: technicalOrdersKey,
  mapRow: (row, itemsField) => {
    const items = (row[itemsField] as { id: string }[] | undefined) ?? [];
    return {
      id: row.id,
      order_number: row.order_number,
      client_type: row.client_type,
      administration_id: row.administration_id,
      administrations: row.company_name ? { company_name: row.company_name } : null,
      particular_full_name: row.particular_full_name,
      status: row.status as TechnicalOrderStatus,
      created_at: row.created_at,
      technical_order_items: items.map((item) => ({ id: item.id })),
    };
  },
});
