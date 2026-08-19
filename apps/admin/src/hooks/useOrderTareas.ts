import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface OrderTareaRow {
  id: string;
  ticket_number: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  description: string;
  /** Legacy field — kept for consumer compat. Maps from key_order_item_id or technical_order_item_id. */
  order_item_id: string | null;
  assigned_to_staff_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Tickets/tareas linked to any order_item of the given order. Branches on
 * order_kind (from public.all_orders VIEW) to look up items in the correct
 * bounded-context table and then query tickets by the corresponding FK column.
 *
 * Used by the legacy ordenes detail page until it is retired in PR-7+.
 */
export function useOrderTareas(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'ordenes', orderId ?? '', 'tareas'],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderTareaRow[]> => {
      if (!orderId) return [];

      // Phase 1: Determine order_kind via the all_orders VIEW.
      const { data: kindRow, error: kindError } = await supabase
        .from('all_orders')
        .select('order_kind')
        .eq('id', orderId)
        .single();

      if (kindError) throw kindError;
      if (!kindRow) return [];

      const orderKind = (kindRow as unknown as { order_kind: string }).order_kind;

      if (orderKind === 'key') {
        // Key orders do not have tickets (no technical work, no ticket seeding at confirm).
        return [];
      }

      // Phase 2: Get technical_order_item IDs for this order.
      const { data: itemRows, error: itemsErr } = await supabase
        .from('technical_order_items')
        .select('id')
        .eq('order_id', orderId);

      if (itemsErr) throw itemsErr;
      const ids = (itemRows ?? []).map((r) => r.id);
      if (ids.length === 0) return [];

      // Phase 3: Fetch tickets linked via technical_order_item_id.
      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .select(
          'id, ticket_number, category, status, description, technical_order_item_id, assigned_to_staff_id, created_at, resolved_at',
        )
        .in('technical_order_item_id', ids)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Map technical_order_item_id → order_item_id for consumer compat.
      return ((data ?? []) as unknown as Array<{
        id: string;
        ticket_number: string;
        category: string;
        status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
        description: string;
        technical_order_item_id: string | null;
        assigned_to_staff_id: string | null;
        created_at: string;
        resolved_at: string | null;
      }>).map((row) => ({
        id: row.id,
        ticket_number: row.ticket_number,
        category: row.category,
        status: row.status,
        description: row.description,
        order_item_id: row.technical_order_item_id,
        assigned_to_staff_id: row.assigned_to_staff_id,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      }));
    },
  });
}
