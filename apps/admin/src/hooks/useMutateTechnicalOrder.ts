import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createTechnicalOrderWithItems,
  confirmTechnicalOrder,
  cancelTechnicalOrder,
  updateDraftTechnicalOrderWithItems,
  markTechnicalOrderInvoiced,
  recomputeTechnicalOrderStatus,
  type TechnicalOrderPayload,
  type TechnicalOrderItemPayload,
  type TechnicalOrderItemUpdatePayload,
} from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { technicalOrdersKey, technicalOrderKey } from '@/lib/queryKeys';
import type { TechnicalOrderDetailRow } from './useTechnicalOrder';
import { toastMutationError } from './mapMutationError';

export interface CreateTechnicalOrderInput {
  order: TechnicalOrderPayload;
  items: TechnicalOrderItemPayload[];
  confirmImmediately?: boolean;
}

export interface ConfirmTechnicalOrderInput {
  id: string;
}

export interface CancelTechnicalOrderInput {
  id: string;
}

export interface UpdateDraftTechnicalOrderInput {
  id: string;
  /** Optimistic concurrency token — must match technical_orders.updated_at at the DB level. */
  expectedUpdatedAt: string;
  order: Partial<TechnicalOrderPayload>;
  items: TechnicalOrderItemUpdatePayload[];
}

export function useMutateTechnicalOrder() {
  const queryClient = useQueryClient();

  const createTechnicalOrder = useMutation({
    mutationFn: ({ order, items, confirmImmediately }: CreateTechnicalOrderInput) =>
      createTechnicalOrderWithItems(supabase, {
        order,
        items,
        confirmImmediately: confirmImmediately ?? true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: technicalOrdersKey() });
      toast.success('Orden de servicio técnico creada correctamente.');
    },
    onError: toastMutationError,
  });

  const confirmTechnicalOrderMutation = useMutation({
    mutationFn: ({ id }: ConfirmTechnicalOrderInput) => confirmTechnicalOrder(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: technicalOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: technicalOrderKey(vars.id) });
      toast.success('Orden confirmada.');
    },
    onError: toastMutationError,
  });

  const cancelTechnicalOrderMutation = useMutation({
    mutationFn: ({ id }: CancelTechnicalOrderInput) => cancelTechnicalOrder(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: technicalOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: technicalOrderKey(vars.id) });
      toast.success('Orden cancelada.');
    },
    onError: toastMutationError,
  });

  const updateDraftTechnicalOrder = useMutation({
    mutationFn: ({ id, order, items, expectedUpdatedAt }: UpdateDraftTechnicalOrderInput) =>
      updateDraftTechnicalOrderWithItems(supabase, {
        orderId: id,
        expectedUpdatedAt,
        patch: order,
        items,
      }),
    // Optimistic patch of order-level scalar fields only. Item edits are
    // reconciled by the post-success invalidation.
    onMutate: async ({ id, order }) => {
      const detailKey = technicalOrderKey(id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot = queryClient.getQueryData<TechnicalOrderDetailRow | null>(detailKey);
      if (snapshot) {
        queryClient.setQueryData<TechnicalOrderDetailRow>(detailKey, {
          ...snapshot,
          ...order,
        });
      }
      return { snapshot, id };
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: technicalOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: technicalOrderKey(vars.id) });
      toast.success('Cambios guardados.');
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(technicalOrderKey(context.id), context.snapshot);
      }
      toastMutationError(err);
    },
  });

  const markTechnicalOrderInvoicedMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => markTechnicalOrderInvoiced(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: technicalOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: technicalOrderKey(vars.id) });
      toast.success('Orden marcada como facturada.');
    },
    onError: toastMutationError,
  });

  const recomputeTechnicalOrderStatusMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => recomputeTechnicalOrderStatus(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: technicalOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: technicalOrderKey(vars.id) });
    },
    onError: toastMutationError,
  });

  return {
    createTechnicalOrder,
    confirmTechnicalOrder: confirmTechnicalOrderMutation,
    cancelTechnicalOrder: cancelTechnicalOrderMutation,
    updateDraftTechnicalOrder,
    markTechnicalOrderInvoiced: markTechnicalOrderInvoicedMutation,
    recomputeTechnicalOrderStatus: recomputeTechnicalOrderStatusMutation,
  };
}
