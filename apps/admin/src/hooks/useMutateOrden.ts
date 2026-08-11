import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { ordensKey, ordenKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface CreateOrderInput {
  order_type: 'keys' | 'technical';
  client_type: 'administration' | 'particular';
  administration_id?: string | null;
  particular_id?: string | null;
  particular_full_name?: string | null;
  particular_dni?: string | null;
  particular_phone?: string | null;
  particular_email?: string | null;
  notes?: string | null;
  status?: 'draft' | 'in_preparation';
}

export interface CreateOrderItemInput {
  item_type:
    | 'key'
    | 'equipment'
    | 'maintenance'
    | 'installation'
    | 'equipment_replacement';
  quantity: number;
  description?: string | null;
  building_id?: string | null;
  equipment_id?: string | null;
  unit_price?: number | null;
  unit_id?: string | null;
  pickup_particular_id?: string | null;
  /**
   * Inventory SKU consumed by this line. Required for key/equipment items so
   * that the AFTER INSERT trigger creates a stock reservation.
   */
  product_id?: string | null;
}

export interface CreateOrdenInput {
  order: CreateOrderInput;
  items: CreateOrderItemInput[];
}

export interface CancelOrdenInput {
  id: string;
}

export interface AdvanceOrdenStatusInput {
  id: string;
}

export interface SetPickupPersonInput {
  id: string;
  /** Order-level authorized retirer. null clears the explicit pickup person. */
  pickup_particular_id: string | null;
}

export function useMutateOrden() {
  const queryClient = useQueryClient();

  const createOrden = useMutation({
    mutationFn: async ({ order, items }: CreateOrdenInput) => {
      const { data, error } = await supabase.rpc('create_order_with_items', {
        // The generated type uses Json for flexibility; cast our typed inputs.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_order: order as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_items: items as any,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      toast.success('Orden creada correctamente.');
    },
    onError: toastMutationError,
  });

  const cancelOrden = useMutation({
    mutationFn: async ({ id }: CancelOrdenInput) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Orden cancelada.');
    },
    onError: toastMutationError,
  });

  const advanceOrdenStatus = useMutation({
    mutationFn: async ({ id }: AdvanceOrdenStatusInput) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'in_preparation' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Preparación iniciada.');
    },
    onError: toastMutationError,
  });

  const setPickupPerson = useMutation({
    mutationFn: async ({ id, pickup_particular_id }: SetPickupPersonInput) => {
      const { error } = await supabase
        .from('orders')
        .update({ pickup_particular_id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Persona de retiro actualizada.');
    },
    onError: toastMutationError,
  });

  const markOrderInvoiced = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'invoiced' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Orden marcada como facturada.');
    },
    onError: toastMutationError,
  });

  return {
    createOrden,
    cancelOrden,
    advanceOrdenStatus,
    setPickupPerson,
    markOrderInvoiced,
  };
}
