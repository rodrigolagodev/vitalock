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
  administrationId?: string;
  buildingId?: string;
}

interface TechnicalOrderSummaryRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  company_name: string | null;
  particular_full_name: string | null;
  status: TechnicalOrderStatus;
  created_at: string;
  technical_order_items: { id: string }[];
}

export function useTechnicalOrders({
  search,
  status,
  administrationId,
  buildingId,
}: UseTechnicalOrdersFilters = {}) {
  const trimmed = search?.trim() ?? '';
  const scopedByBuilding = Boolean(buildingId && buildingId !== 'all');

  return useQuery({
    queryKey: technicalOrdersKey(status, trimmed, administrationId, buildingId),
    queryFn: async (): Promise<TechnicalOrderListRow[]> => {
      const embed = scopedByBuilding
        ? 'technical_order_items!inner(id,building_id)'
        : 'technical_order_items(id)';

      let query = supabase
        .from('technical_orders_summary')
        .select(
          `id, order_number, client_type, administration_id, company_name, particular_full_name, status, created_at, ${embed}`,
        );

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (administrationId && administrationId !== 'all') {
        query = query.eq('administration_id', administrationId);
      }

      if (scopedByBuilding) {
        query = query.eq('technical_order_items.building_id', buildingId!);
      }

      if (trimmed) {
        const safe = escapeIlikeValue(trimmed);
        query = query.or(
          `order_number.ilike.%${safe}%,particular_full_name.ilike.%${safe}%,company_name.ilike.%${safe}%`,
        );
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as TechnicalOrderSummaryRow[];

      return rows.map((row) => ({
        id: row.id,
        order_number: row.order_number,
        client_type: row.client_type,
        administration_id: row.administration_id,
        administrations: row.company_name ? { company_name: row.company_name } : null,
        particular_full_name: row.particular_full_name,
        status: row.status,
        created_at: row.created_at,
        technical_order_items: row.technical_order_items.map((item) => ({ id: item.id })),
      }));
    },
  });
}
