import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { productsKey } from '@/lib/queryKeys';
import type { ProductCategory, ProductRow } from '@/types/stock';

export interface UseProductsFilters {
  category?: ProductCategory;
  search?: string;
}

/**
 * Product catalog list. Category is filtered server-side; name search is a
 * client-side substring match (spec: no debounce required). `stock_disponible`
 * is derived client-side as `stock_total - stock_reservado`.
 */
export function useProducts({ category, search }: UseProductsFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: productsKey(category, trimmed),
    queryFn: async (): Promise<ProductRow[]> => {
      let query = supabase.from('products').select(
        'id, name, category, cost_price, stock_total, stock_reservado, created_at, updated_at',
      );

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;

      let rows = (data ?? []) as unknown as ProductRow[];

      if (trimmed) {
        const q = trimmed.toLowerCase();
        rows = rows.filter((row) => row.name.toLowerCase().includes(q));
      }

      return rows.map((row) => ({
        ...row,
        category: row.category as ProductCategory,
        stock_disponible: row.stock_total - row.stock_reservado,
      }));
    },
  });
}
