import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { productsKey, stockMovementsKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';
import type { MovementType, ProductCategory } from '@/types/stock';

export interface CreateMovementInput {
  productId: string;
  /** Manual movement types only — the RPC rejects auto-emitted types (reserva, egreso_*, liberacion_reserva). */
  movementType: MovementType;
  quantity: number;
  unitCost?: number | null;
  note?: string | null;
  /** Current admin staff id; supplied by the caller from useAuthContext(). */
  actor_staff_id?: string | null;
}

export interface CreateProductWithStockInput {
  name: string;
  category: ProductCategory;
  costPrice?: number | null;
  quantity: number;
  note?: string | null;
  /** Current admin staff id; supplied by the caller from useAuthContext(). */
  actor_staff_id?: string | null;
}

export function useMutateStockMovement() {
  const queryClient = useQueryClient();

  const createMovement = useMutation({
    mutationFn: async (input: CreateMovementInput) => {
      const { data, error } = await supabase.rpc('create_stock_movement', {
        p_product_id: input.productId,
        p_type: input.movementType,
        p_quantity: input.quantity,
        ...(input.unitCost != null ? { p_unit_cost: input.unitCost } : {}),
        ...(input.note?.trim() ? { p_note: input.note.trim() } : {}),
        ...(input.actor_staff_id ? { p_actor_staff_id: input.actor_staff_id } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: productsKey() });
      void queryClient.invalidateQueries({ queryKey: stockMovementsKey(vars.productId) });
      toast.success('Movimiento de stock registrado.');
    },
    onError: toastMutationError,
  });

  const createProductWithStock = useMutation({
    mutationFn: async (input: CreateProductWithStockInput) => {
      const { data, error } = await supabase.rpc('create_product_with_initial_stock', {
        p_name: input.name,
        p_category: input.category,
        ...(input.costPrice != null ? { p_cost_price: input.costPrice } : {}),
        p_quantity: input.quantity,
        ...(input.note?.trim() ? { p_note: input.note.trim() } : {}),
        ...(input.actor_staff_id ? { p_actor_staff_id: input.actor_staff_id } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (productId) => {
      void queryClient.invalidateQueries({ queryKey: productsKey() });
      // The RPC returns the newly created product id; its ledger cannot be
      // cached yet, but invalidating keeps the key fresh for any in-flight cache.
      void queryClient.invalidateQueries({ queryKey: stockMovementsKey(productId) });
      toast.success('Producto creado correctamente.');
    },
    onError: toastMutationError,
  });

  return { createMovement, createProductWithStock };
}
