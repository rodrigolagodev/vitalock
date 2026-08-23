import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * A single support ticket linked to a technical order item.
 *
 * Uses `technical_order_item_id` directly (no legacy alias), because this hook is
 * scoped exclusively to the technical-orders bounded context and does not need to
 * bridge the legacy `order_item_id` field that `useOrderTareas` maintained for
 * cross-context compat.
 */
export interface TechnicalOrderTicketRow {
  id: string;
  ticket_number: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  description: string;
  technical_order_item_id: string | null;
  assigned_to_staff_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Fetches support.tickets linked to a technical order.
 *
 * Query strategy (no resolveOrderKind branching — scope is statically known):
 *   1. Fetch technical_order_items.id where order_id = orderId.
 *   2. If zero items, return [] without querying tickets.
 *   3. Fetch support.tickets where technical_order_item_id IN (…), ordered ASC by created_at.
 *
 * Query key: ['admin', 'technical-orders', orderId, 'tickets']
 */
export function useTechnicalOrderTickets(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'technical-orders', orderId ?? '', 'tickets'],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<TechnicalOrderTicketRow[]> => {
      if (!orderId) return [];

      // Step 1: Fetch item IDs for this technical order.
      const { data: itemRows, error: itemsErr } = await supabase
        .from('technical_order_items')
        .select('id')
        .eq('order_id', orderId);

      if (itemsErr) throw itemsErr;

      const ids = (itemRows ?? []).map((r) => r.id);
      if (ids.length === 0) return [];

      // Step 2: Fetch linked tickets from the support schema.
      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .select(
          'id, ticket_number, category, status, description, technical_order_item_id, assigned_to_staff_id, created_at, resolved_at',
        )
        .in('technical_order_item_id', ids)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data ?? []) as unknown as TechnicalOrderTicketRow[];
    },
  });
}
