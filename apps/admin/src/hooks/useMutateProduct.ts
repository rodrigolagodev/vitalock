import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { productKey, productsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';
import type { ProductCategory } from '@/types/stock';

export interface UpdateProductInput {
  id: string;
  name?: string;
  category?: ProductCategory;
  cost_price?: number | null;
}

export function useMutateProduct() {
  const queryClient = useQueryClient();

  const updateProduct = useMutation({
    mutationFn: async (input: UpdateProductInput) => {
      const { id, ...fields } = input;
      const { data, error } = await supabase
        .from('products')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: productKey(vars.id) });
      void queryClient.invalidateQueries({ queryKey: productsKey() });
      toast.success('Producto actualizado correctamente.');
    },
    onError: toastMutationError,
  });

  return { updateProduct };
}
