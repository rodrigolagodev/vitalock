import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  cancelOrder,
  confirmOrder,
  createOrderWithItems,
  markOrderInvoiced,
  setOrderPickupPerson,
  updateDraftOrderWithItems,
  type OrderItemPayload,
  type OrderItemUpdatePayload,
  type OrderPayload,
} from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { ordensKey, ordenKey } from '@/lib/queryKeys';
import type { OrdenDetailRow } from './useOrden';
import { toastMutationError } from './mapMutationError';

// Re-export payload types so existing call sites keep working.
export type CreateOrderInput = OrderPayload;
export type CreateOrderItemInput = OrderItemPayload;

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
  items: OrderItemUpdatePayload[];
}

export interface SetPickupPersonInput {
  id: string;
  /** Order-level authorized retirer. null clears the explicit pickup person. */
  pickup_particular_id: string | null;
}

export function useMutateOrden() {
  const queryClient = useQueryClient();

  const createOrden = useMutation({
    mutationFn: ({ order, items }: CreateOrdenInput) =>
      createOrderWithItems(supabase, { order, items }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      toast.success('Orden creada correctamente.');
    },
    onError: toastMutationError,
  });

  const cancelOrden = useMutation({
    mutationFn: ({ id }: CancelOrdenInput) => cancelOrder(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Orden cancelada.');
    },
    onError: toastMutationError,
  });

  const confirmOrden = useMutation({
    mutationFn: ({ id }: ConfirmOrdenInput) => confirmOrder(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Orden confirmada.');
    },
    onError: toastMutationError,
  });

  const updateDraftOrden = useMutation({
    mutationFn: ({ id, order, items, expectedUpdatedAt }: UpdateDraftOrdenInput) =>
      updateDraftOrderWithItems(supabase, {
        orderId: id,
        expectedUpdatedAt,
        patch: order,
        items,
      }),
    // Optimistic patch of order-level scalar fields only. Item edits are
    // reconciled by the post-success invalidation because the cache row
    // carries embedded FKs (pickup_particulares, rfid_keys) that we cannot
    // reconstruct from the incoming payload without a round-trip.
    onMutate: async ({ id, order }) => {
      const detailKey = ordenKey(id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot = queryClient.getQueryData<OrdenDetailRow | null>(detailKey);
      if (snapshot) {
        queryClient.setQueryData<OrdenDetailRow>(detailKey, {
          ...snapshot,
          ...order,
        });
      }
      return { snapshot, id };
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Cambios guardados.');
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(ordenKey(context.id), context.snapshot);
      }
      toastMutationError(err);
    },
  });

  const setPickupPerson = useMutation({
    mutationFn: ({ id, pickup_particular_id }: SetPickupPersonInput) =>
      setOrderPickupPerson(supabase, {
        orderId: id,
        pickupParticularId: pickup_particular_id,
      }),
    onMutate: async ({ id, pickup_particular_id }) => {
      const detailKey = ordenKey(id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot = queryClient.getQueryData<OrdenDetailRow | null>(detailKey);
      if (snapshot) {
        queryClient.setQueryData<OrdenDetailRow>(detailKey, {
          ...snapshot,
          pickup_particular_id,
        });
      }
      return { snapshot, id };
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.id) });
      toast.success('Persona de retiro actualizada.');
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(ordenKey(context.id), context.snapshot);
      }
      toastMutationError(err);
    },
  });

  const markOrderInvoicedMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => markOrderInvoiced(supabase, id),
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
    markOrderInvoiced: markOrderInvoicedMutation,
  };
}
