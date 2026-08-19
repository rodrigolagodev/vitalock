import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  cancelKeyOrder,
  confirmKeyOrder,
  createKeyOrderWithItems,
  markKeyOrderInvoiced,
  setKeyOrderPickupPerson,
  updateDraftKeyOrderWithItems,
  type KeyOrderItemPayload,
  type KeyOrderItemUpdatePayload,
  type KeyOrderPayload,
} from '@vitalock/supabase';
import {
  cancelTechnicalOrder,
  confirmTechnicalOrder,
  createTechnicalOrderWithItems,
  markTechnicalOrderInvoiced,
  updateDraftTechnicalOrderWithItems,
  type TechnicalOrderItemPayload,
  type TechnicalOrderItemUpdatePayload,
  type TechnicalOrderPayload,
} from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { ordensKey, ordenKey } from '@/lib/queryKeys';
import type { OrdenDetailRow } from './useOrden';
import { toastMutationError } from './mapMutationError';

// ────────────────────────────────────────────────────────────────────────────
// Preserved legacy input types — consumer signatures are UNCHANGED.
// ────────────────────────────────────────────────────────────────────────────

export type OrderType = 'keys' | 'technical';

export interface CreateOrderInput {
  order_type: OrderType;
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
  item_type: 'key' | 'equipment' | 'maintenance' | 'installation' | 'equipment_replacement';
  quantity: number;
  description?: string | null;
  building_id?: string | null;
  unit_price?: number | null;
  unit_id?: string | null;
  pickup_particular_id?: string | null;
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
  /** Optimistic concurrency token — must match the DB level. */
  expectedUpdatedAt: string;
  order: Partial<CreateOrderInput>;
  items: Array<Partial<CreateOrderItemInput> & { id?: string }>;
}

export interface SetPickupPersonInput {
  id: string;
  /** Order-level authorized retirer. null clears the explicit pickup person. */
  pickup_particular_id: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helper: resolve order_kind from the all_orders VIEW.
// ────────────────────────────────────────────────────────────────────────────

async function resolveOrderKind(orderId: string): Promise<'keys' | 'technical'> {
  const { data, error } = await supabase
    .from('all_orders')
    .select('order_kind')
    .eq('id', orderId)
    .single();
  if (error) throw error;
  return (data as unknown as { order_kind: string }).order_kind === 'key' ? 'keys' : 'technical';
}

// ────────────────────────────────────────────────────────────────────────────
// Hook — preserved external surface, new internal routing.
// ────────────────────────────────────────────────────────────────────────────

export function useMutateOrden() {
  const queryClient = useQueryClient();

  const createOrden = useMutation({
    mutationFn: ({ order, items }: CreateOrdenInput) => {
      if (order.order_type === 'keys') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { order_type: _ot, status: _s, ...rest } = order;
        return createKeyOrderWithItems(supabase, {
          order: rest as KeyOrderPayload,
          items: items as unknown as KeyOrderItemPayload[],
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { order_type: _ot, status: _s, ...rest } = order;
      return createTechnicalOrderWithItems(supabase, {
        order: rest as TechnicalOrderPayload,
        items: items as unknown as TechnicalOrderItemPayload[],
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      toast.success('Orden creada correctamente.');
    },
    onError: toastMutationError,
  });

  const cancelOrden = useMutation({
    mutationFn: async ({ id }: CancelOrdenInput) => {
      const kind = await resolveOrderKind(id);
      if (kind === 'keys') {
        return cancelKeyOrder(supabase, id);
      }
      return cancelTechnicalOrder(supabase, id);
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
      const kind = await resolveOrderKind(id);
      if (kind === 'keys') {
        return confirmKeyOrder(supabase, id);
      }
      return confirmTechnicalOrder(supabase, id);
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
      const kind = await resolveOrderKind(id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { order_type: _ot, status: _s, ...patch } = order;
      if (kind === 'keys') {
        return updateDraftKeyOrderWithItems(supabase, {
          orderId: id,
          expectedUpdatedAt,
          patch: patch as Partial<KeyOrderPayload>,
          items: items as unknown as KeyOrderItemUpdatePayload[],
        });
      }
      return updateDraftTechnicalOrderWithItems(supabase, {
        orderId: id,
        expectedUpdatedAt,
        patch: patch as Partial<TechnicalOrderPayload>,
        items: items as unknown as TechnicalOrderItemUpdatePayload[],
      });
    },
    // Optimistic patch of order-level scalar fields only.
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
      // setKeyOrderPickupPerson is key-context only; technical orders have no pickup semantics.
      setKeyOrderPickupPerson(supabase, {
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
    mutationFn: async ({ id }: { id: string }) => {
      const kind = await resolveOrderKind(id);
      if (kind === 'keys') {
        return markKeyOrderInvoiced(supabase, id);
      }
      return markTechnicalOrderInvoiced(supabase, id);
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
    markOrderInvoiced: markOrderInvoicedMutation,
  };
}
