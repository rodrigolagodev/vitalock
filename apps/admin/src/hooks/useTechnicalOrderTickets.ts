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
 * Fetches support.tickets linked to a technical order via the
 * support.technical_order_tickets cross-schema view.
 *
 * Single round-trip: .schema('support').from('technical_order_tickets')
 *   .eq('technical_order_id', orderId) — no two-step sequential pattern.
 *
 * Query key: ['admin', 'technical-orders', orderId, 'tickets']
 */
export function useTechnicalOrderTickets(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'technical-orders', orderId ?? '', 'tickets'],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<TechnicalOrderTicketRow[]> => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .schema('support')
        .from('technical_order_tickets')
        .select(
          'id, ticket_number, category, status, description, technical_order_item_id, assigned_to_staff_id, created_at, resolved_at',
        )
        .eq('technical_order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data ?? []) as unknown as TechnicalOrderTicketRow[];
    },
  });
}
