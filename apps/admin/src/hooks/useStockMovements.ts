import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { stockMovementsKey } from '@/lib/queryKeys';
import type { MovementType, StockMovementRow } from '@/types/stock';

/**
 * Movement ledger for a single product, newest first.
 *
 * Note: PostgREST cannot embed cross-schema FKs (support.tickets and
 * identity.staff are in other schemas), so we fetch the flat rows and resolve
 * `ticket_number` and `staff_name` with batch lookups, mirroring the
 * useTareas.ts batch-lookup pattern. When there are zero ids to resolve the
 * batch calls are skipped entirely.
 */
export function useStockMovements(productId: string | undefined) {
  return useQuery({
    queryKey: stockMovementsKey(productId ?? ''),
    enabled: Boolean(productId),
    queryFn: async (): Promise<StockMovementRow[]> => {
      if (!productId) return [];

      const { data, error } = await supabase
        .from('stock_movements')
        .select(
          'id, product_id, type, quantity, unit_cost, note, order_id, order_item_id, ticket_id, staff_id, created_by, created_at',
        )
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as StockMovementRow[];

      const staffIds = [
        ...new Set(
          rows.map((r) => r.created_by).filter((v): v is string => Boolean(v)),
        ),
      ];
      const staffMap = new Map<string, string>();
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .schema('identity')
          .from('staff')
          .select('id, full_name')
          .in('id', staffIds);
        for (const s of staff ?? []) staffMap.set(s.id, s.full_name);
      }

      const ticketIds = [
        ...new Set(
          rows.map((r) => r.ticket_id).filter((v): v is string => Boolean(v)),
        ),
      ];
      const ticketMap = new Map<string, string>();
      if (ticketIds.length > 0) {
        const { data: tickets } = await supabase
          .schema('support')
          .from('tickets')
          .select('id, ticket_number')
          .in('id', ticketIds);
        for (const t of tickets ?? []) ticketMap.set(t.id, t.ticket_number);
      }

      return rows.map((row) => ({
        ...row,
        type: row.type as MovementType,
        ticket_number: row.ticket_id ? ticketMap.get(row.ticket_id) ?? null : null,
        staff_name: row.created_by ? staffMap.get(row.created_by) ?? null : null,
      }));
    },
  });
}
