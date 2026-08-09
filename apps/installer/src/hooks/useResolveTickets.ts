import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/auth/AuthProvider';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface ResolvePayload {
  ids: string[];
  notes?: string | null;
}

export function useResolveTickets() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async ({ ids, notes }: ResolvePayload) => {
      if (ids.length === 0) return;

      const { error } = await supabase
        .schema('support')
        .from('tickets')
        .update({
          status: 'resolved',
          resolved_by_staff_id: staffId,
          resolved_at: new Date().toISOString(),
          resolution_notes: notes ?? null,
        })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_data, { ids }) => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      toast.success(
        ids.length === 1 ? 'Ticket resuelto.' : `${ids.length} tickets resueltos.`,
      );
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
