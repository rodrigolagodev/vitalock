import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { productKey } from '@/lib/queryKeys';
import type { ProductCategory, ProductRow } from '@/types/stock';

/** Single product by id; disabled until a truthy id is provided. */
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ProductRow | undefined> => {
      if (!id) return undefined;

      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, category, cost_price, stock_total, stock_reservado, created_at, updated_at',
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      const row = data as unknown as ProductRow;
      return {
        ...row,
        category: row.category as ProductCategory,
        stock_disponible: row.stock_total - row.stock_reservado,
      };
    },
  });
}
