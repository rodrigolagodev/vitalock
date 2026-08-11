import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface OrderTareaRow {
  id: string;
  ticket_number: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  description: string;
  order_item_id: string | null;
  assigned_to_staff_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Tickets/tareas linked to any order_item of the given order. Used by the
 * technical-order detail page to expose the wired-up ticket list without
 * duplicating the useTareas machinery (staff filtering, unit embed, etc.).
 */
export function useOrderTareas(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'ordenes', orderId ?? '', 'tareas'],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderTareaRow[]> => {
      if (!orderId) return [];

      const { data: itemIds, error: itemsErr } = await supabase
        .from('order_items')
        .select('id')
        .eq('order_id', orderId);
      if (itemsErr) throw itemsErr;
      const ids = (itemIds ?? []).map((r) => r.id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .select(
          'id, ticket_number, category, status, description, order_item_id, assigned_to_staff_id, created_at, resolved_at',
        )
        .in('order_item_id', ids)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as OrderTareaRow[];
    },
  });
}
