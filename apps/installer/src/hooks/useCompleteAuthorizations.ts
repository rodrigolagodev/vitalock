import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { completeAuthorizations as completeAuthorizationsRpc } from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@vitalock/shared';
import { worklistKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

interface CompletePayloadItem {
  id: string;
  sync_state: 'pending_install' | 'pending_removal';
}

interface CompletePayload {
  items: CompletePayloadItem[];
}

export function useCompleteAuthorizations() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: ({ items }: CompletePayload) => {
      const installIds = items.filter((i) => i.sync_state === 'pending_install').map((i) => i.id);
      const removeIds = items.filter((i) => i.sync_state === 'pending_removal').map((i) => i.id);
      return completeAuthorizationsRpc(supabase, { installIds, removeIds, staffId });
    },
    onSuccess: (_data, { items }) => {
      void queryClient.invalidateQueries({ queryKey: worklistKey(staffId) });
      toast.success(
        items.length === 1
          ? 'Llave marcada como hecha.'
          : `${items.length} llaves marcadas como hechas.`,
      );
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
