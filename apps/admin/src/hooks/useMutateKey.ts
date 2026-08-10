import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { keysKey, ordenKey, ordensKey } from '@/lib/queryKeys';
import { keyEventsKey } from './useKeyEvents';
import { toastMutationError } from './mapMutationError';

export interface CreateKeyInput {
  rfid_code: string;
  unit_id: string;
  status?: 'active' | 'disabled';
  notes?: string | null;
  picked_up_by_name?: string | null;
  picked_up_by_surname?: string | null;
  picked_up_by_dni?: string | null;
  picked_up_at?: string | null;
  delivered_by_staff_id?: string | null;
  /** When set, links this key to an order item from the ordenes flow. */
  order_item_id?: string | null;
}

export interface ChangeStatusInput {
  id: string;
  status: 'active' | 'disabled';
  note?: string | null;
  actor_staff_id?: string | null;
}

export interface RecordPickupInput {
  /** Order owning the key — required to invalidate its detail query. */
  order_id: string;
  key_id: string;
  picked_up_by_name: string;
  picked_up_by_surname: string;
  picked_up_by_dni: string;
  actor_staff_id?: string | null;
}

/**
 * Key mutations.
 *
 * NOTE: keys are semi-immutable post-creation. There is no `updateKey` — only
 * `createKey` (typically invoked from an Orden preparation flow, still to be
 * built) and `changeStatus`, which atomically updates the key status, records
 * the event (optional note), and queues physical key removal/install on
 * operations.key_authorizations via public.change_key_status.
 */
export function useMutateKey(buildingId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateKeys = () =>
    queryClient.invalidateQueries({ queryKey: keysKey(buildingId) });

  const createKey = useMutation({
    mutationFn: async (input: CreateKeyInput) => {
      const { data, error } = await supabase
        .from('rfid_keys')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void invalidateKeys();
      toast.success('Llave creada correctamente.');
    },
    onError: toastMutationError,
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status, note, actor_staff_id }: ChangeStatusInput) => {
      const trimmedNote = note?.trim();
      const { error } = await supabase.rpc('change_key_status', {
        p_key_id: id,
        p_status: status,
        ...(trimmedNote ? { p_note: trimmedNote } : {}),
        ...(actor_staff_id ? { p_actor_staff_id: actor_staff_id } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void invalidateKeys();
      void queryClient.invalidateQueries({ queryKey: keyEventsKey(vars.id) });
      toast.success(
        vars.status === 'active' ? 'Llave activada.' : 'Llave dada de baja.',
      );
    },
    onError: toastMutationError,
  });

  const recordPickup = useMutation({
    mutationFn: async ({
      order_id,
      key_id,
      picked_up_by_name,
      picked_up_by_surname,
      picked_up_by_dni,
      actor_staff_id,
    }: RecordPickupInput) => {
      const { error } = await supabase.rpc('record_order_key_pickup', {
        p_key_id: key_id,
        p_picked_up_by_name: picked_up_by_name,
        p_picked_up_by_surname: picked_up_by_surname,
        p_picked_up_by_dni: picked_up_by_dni,
        ...(actor_staff_id ? { p_actor_staff_id: actor_staff_id } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      // The RPC may auto-complete the order (status → completed), so the
      // order detail + list and the keys list all need a refresh.
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.order_id) });
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void invalidateKeys();
      toast.success('Retiro registrado.');
    },
    onError: toastMutationError,
  });

  return { createKey, changeStatus, recordPickup };
}
