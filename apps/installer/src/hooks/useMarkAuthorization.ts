import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/auth/AuthProvider';
import { worklistKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarkPayload =
  | { authorizationId: string; kind: 'install' }
  | { authorizationId: string; kind: 'remove'; remove_reason: string | null };

// ---------------------------------------------------------------------------
// Hook — pessimistic mutation
// ---------------------------------------------------------------------------

export function useMarkAuthorization() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async (payload: MarkPayload) => {
      if (payload.kind === 'install') {
        const { error } = await supabase
          .schema('operations')
          .from('key_authorizations')
          .update({
            sync_state: 'installed',
            installed_by_staff_id: staffId,
          })
          .eq('id', payload.authorizationId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .schema('operations')
          .from('key_authorizations')
          .update({
            sync_state: 'removed',
            removed_by_staff_id: staffId,
            remove_reason: payload.remove_reason ?? null,
          })
          .eq('id', payload.authorizationId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worklistKey(staffId) });
      toast.success('Llave actualizada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
