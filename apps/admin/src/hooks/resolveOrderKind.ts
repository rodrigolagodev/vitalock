import { supabase } from '@/lib/supabase';

export type OrderKind = 'key' | 'technical';

/**
 * Resolves the order_kind for a given order ID from the public.all_orders VIEW.
 * Throws if the query fails or no row is found (single() semantics).
 */
export async function resolveOrderKind(orderId: string): Promise<OrderKind> {
  const { data, error } = await supabase
    .from('all_orders')
    .select('order_kind')
    .eq('id', orderId)
    .single();

  if (error) throw error;

  return (data as unknown as { order_kind: string }).order_kind as OrderKind;
}
