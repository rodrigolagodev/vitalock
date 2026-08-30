import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@vitalock/shared';
import { worklistKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

export interface CompletePayloadItem {
  id: string;
  sync_state: 'pending_install' | 'pending_removal';
}

export interface CompletePayload {
  items: CompletePayloadItem[];
}

export function useCompleteAuthorizations() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async ({ items }: CompletePayload) => {
      const now = new Date().toISOString();
      const installIds = items.filter((i) => i.sync_state === 'pending_install').map((i) => i.id);
      const removeIds = items.filter((i) => i.sync_state === 'pending_removal').map((i) => i.id);

      if (installIds.length > 0) {
        const { error } = await supabase
          .schema('operations')
          .from('key_authorizations')
          .update({
            sync_state: 'installed',
            installed_by_staff_id: staffId,
            installed_at: now,
          })
          .in('id', installIds);
        if (error) throw error;
      }

      if (removeIds.length > 0) {
        const { error } = await supabase
          .schema('operations')
          .from('key_authorizations')
          .update({
            sync_state: 'removed',
            removed_by_staff_id: staffId,
            removed_at: now,
          })
          .in('id', removeIds);
        if (error) throw error;
      }
    },
    onSuccess: (_data, { items }) => {
      void queryClient.invalidateQueries({ queryKey: worklistKey(staffId) });
      toast.success(
        items.length === 1 ? 'Llave marcada como hecha.' : `${items.length} llaves marcadas como hechas.`,
      );
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
