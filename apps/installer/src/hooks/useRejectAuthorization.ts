import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@vitalock/shared';
import { worklistKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface RejectPayload {
  id: string;
  sync_state: 'pending_install' | 'pending_removal';
  reason: string;
}

export function useRejectAuthorization() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async ({ id, sync_state, reason }: RejectPayload) => {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error('El motivo es requerido.');

      const update: Record<string, unknown> = {
        sync_state: 'cancelled',
        reject_reason: trimmed,
      };
      if (sync_state === 'pending_install') {
        update.installed_by_staff_id = staffId;
      } else {
        update.removed_by_staff_id = staffId;
      }

      const { error } = await supabase
        .schema('operations')
        .from('key_authorizations')
        .update(update)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worklistKey(staffId) });
      toast.success('Llave rechazada.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
