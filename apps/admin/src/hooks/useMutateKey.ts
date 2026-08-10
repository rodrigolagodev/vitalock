import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { keysKey } from '@/lib/queryKeys';
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
}

export interface ChangeStatusInput {
  id: string;
  status: 'active' | 'disabled';
  note: string;
  actor_staff_id?: string | null;
}

/**
 * Key mutations.
 *
 * NOTE: keys are semi-immutable post-creation. There is no `updateKey` — only
 * `createKey` (typically invoked from an Orden preparation flow, still to be
 * built) and `changeStatus`, which requires a mandatory note recorded to
 * `public.key_events`.
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
      const trimmed = note.trim();
      if (!trimmed) throw new Error('La nota es requerida.');

      const update: Record<string, unknown> = { status };
      if (status === 'disabled') {
        update.deactivated_at = new Date().toISOString();
      } else {
        update.deactivated_at = null;
      }

      const { error: updErr } = await supabase
        .from('rfid_keys')
        .update(update)
        .eq('id', id);
      if (updErr) throw updErr;

      const { error: evtErr } = await supabase.from('key_events').insert({
        key_id: id,
        event_type: status === 'active' ? 'activated' : 'deactivated',
        note: trimmed,
        actor_staff_id: actor_staff_id ?? null,
      });
      if (evtErr) throw evtErr;
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

  return { createKey, changeStatus };
}
