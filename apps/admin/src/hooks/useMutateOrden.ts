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
  status?: 'draft';
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
   * that the confirm_order RPC creates a stock reservation.
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

export interface ConfirmOrdenInput {
  id: string;
}

export interface UpdateDraftOrdenInput {
  id: string;
  /** Optimistic concurrency token — must match orders.updated_at at the DB level. */
  expectedUpdatedAt: string;
  order: Partial<CreateOrderInput>;
  items: (CreateOrderItemInput & { id?: string })[];
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

  const confirmOrden = useMutation({
    mutationFn: async ({ id }: ConfirmOrdenInput) => {
      const { error } = await supabase.rpc('confirm_order', { p_order_id: id });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Orden confirmada.');
    },
    onError: toastMutationError,
  });

  const updateDraftOrden = useMutation({
    mutationFn: async ({ id, order, items, expectedUpdatedAt }: UpdateDraftOrdenInput) => {
      const { data, error } = await supabase.rpc('update_draft_order_with_items', {
        p_order_id: id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_patch: order as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_items: items as any,
        p_expected_updated_at: expectedUpdatedAt,
      });
      if (error) throw error;
      return data as string; // new updated_at timestamp
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Cambios guardados.');
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
    confirmOrden,
    updateDraftOrden,
    setPickupPerson,
    markOrderInvoiced,
  };
}
