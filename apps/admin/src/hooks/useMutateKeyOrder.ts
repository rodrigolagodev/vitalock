import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createKeyOrderWithItems,
  confirmKeyOrder,
  cancelKeyOrder,
  updateDraftKeyOrderWithItems,
  markKeyOrderInvoiced,
  markKeyOrderItemInstalled,
  configureKeyOrderItem,
  setKeyOrderPickupPerson,
  type KeyOrderPayload,
  type KeyOrderItemPayload,
  type KeyOrderItemUpdatePayload,
  type ConfigureKeyOrderItemInput as BaseConfigureKeyOrderItemInput,
} from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { keyOrdersKey, keyOrderKey } from '@/lib/queryKeys';
import type { KeyOrderDetailRow } from './useKeyOrder';
import { toastMutationError } from './mapMutationError';

export interface CreateKeyOrderInput {
  order: KeyOrderPayload;
  items: KeyOrderItemPayload[];
  confirmImmediately?: boolean;
}

export interface ConfirmKeyOrderInput {
  id: string;
}

export interface CancelKeyOrderInput {
  id: string;
}

export interface UpdateDraftKeyOrderInput {
  id: string;
  /** Optimistic concurrency token — must match key_orders.updated_at at the DB level. */
  expectedUpdatedAt: string;
  order: Partial<KeyOrderPayload>;
  items: KeyOrderItemUpdatePayload[];
}

export interface SetKeyOrderPickupPersonInput {
  id: string;
  /** Order-level authorized retirer. null clears the explicit pickup person. */
  pickup_particular_id: string | null;
}

/** Extends the base configure input with an optional orderId for targeted cache invalidation. */
export interface ConfigureKeyOrderItemInput extends BaseConfigureKeyOrderItemInput {
  orderId?: string;
}

export function useMutateKeyOrder() {
  const queryClient = useQueryClient();

  const createKeyOrder = useMutation({
    mutationFn: ({ order, items, confirmImmediately }: CreateKeyOrderInput) =>
      createKeyOrderWithItems(supabase, {
        order,
        items,
        confirmImmediately: confirmImmediately ?? true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      toast.success('Orden de llave creada correctamente.');
    },
    onError: toastMutationError,
  });

  const confirmKeyOrderMutation = useMutation({
    mutationFn: ({ id }: ConfirmKeyOrderInput) => confirmKeyOrder(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.id) });
      toast.success('Orden confirmada.');
    },
    onError: toastMutationError,
  });

  const cancelKeyOrderMutation = useMutation({
    mutationFn: ({ id }: CancelKeyOrderInput) => cancelKeyOrder(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.id) });
      toast.success('Orden cancelada.');
    },
    onError: toastMutationError,
  });

  const updateDraftKeyOrder = useMutation({
    mutationFn: ({ id, order, items, expectedUpdatedAt }: UpdateDraftKeyOrderInput) =>
      updateDraftKeyOrderWithItems(supabase, {
        orderId: id,
        expectedUpdatedAt,
        patch: order,
        items,
      }),
    // Optimistic patch of order-level scalar fields only. Item edits are
    // reconciled by the post-success invalidation.
    onMutate: async ({ id, order }) => {
      const detailKey = keyOrderKey(id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot = queryClient.getQueryData<KeyOrderDetailRow | null>(detailKey);
      if (snapshot) {
        queryClient.setQueryData<KeyOrderDetailRow>(detailKey, {
          ...snapshot,
          ...order,
        });
      }
      return { snapshot, id };
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.id) });
      toast.success('Cambios guardados.');
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(keyOrderKey(context.id), context.snapshot);
      }
      toastMutationError(err);
    },
  });

  const markKeyOrderInvoicedMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => markKeyOrderInvoiced(supabase, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.id) });
      toast.success('Orden marcada como facturada.');
    },
    onError: toastMutationError,
  });

  const setKeyOrderPickupPersonMutation = useMutation({
    mutationFn: ({ id, pickup_particular_id }: SetKeyOrderPickupPersonInput) =>
      setKeyOrderPickupPerson(supabase, {
        orderId: id,
        pickupParticularId: pickup_particular_id,
      }),
    onMutate: async ({ id, pickup_particular_id }) => {
      const detailKey = keyOrderKey(id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot = queryClient.getQueryData<KeyOrderDetailRow | null>(detailKey);
      if (snapshot) {
        queryClient.setQueryData<KeyOrderDetailRow>(detailKey, {
          ...snapshot,
          pickup_particular_id,
        });
      }
      return { snapshot, id };
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.id) });
      toast.success('Persona de retiro actualizada.');
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(keyOrderKey(context.id), context.snapshot);
      }
      toastMutationError(err);
    },
  });

  const configureKeyOrderItemMutation = useMutation({
    mutationFn: (input: ConfigureKeyOrderItemInput) =>
      configureKeyOrderItem(supabase, {
        orderItemId: input.orderItemId,
        rfidCode: input.rfidCode,
        unitId: input.unitId,
        equipmentIds: input.equipmentIds,
      }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      if (vars.orderId) {
        void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.orderId) });
      }
      toast.success('Llave configurada correctamente.');
    },
    onError: toastMutationError,
  });

  const markKeyOrderItemInstalledMutation = useMutation({
    mutationFn: ({ orderItemId }: { orderItemId: string; orderId?: string }) =>
      markKeyOrderItemInstalled(supabase, orderItemId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: keyOrdersKey() });
      if (vars.orderId) {
        void queryClient.invalidateQueries({ queryKey: keyOrderKey(vars.orderId) });
      }
      toast.success('Llave marcada como instalada.');
    },
    onError: toastMutationError,
  });

  return {
    createKeyOrder,
    confirmKeyOrder: confirmKeyOrderMutation,
    cancelKeyOrder: cancelKeyOrderMutation,
    updateDraftKeyOrder,
    markKeyOrderInvoiced: markKeyOrderInvoicedMutation,
    setKeyOrderPickupPerson: setKeyOrderPickupPersonMutation,
    configureKeyOrderItem: configureKeyOrderItemMutation,
    markKeyOrderItemInstalled: markKeyOrderItemInstalledMutation,
  };
}
