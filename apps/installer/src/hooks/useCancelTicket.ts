import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/auth/AuthProvider';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface CancelPayload {
  id: string;
  reason: string;
}

export function useCancelTicket() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async ({ id, reason }: CancelPayload) => {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error('El motivo es requerido.');

      const { error } = await supabase
        .schema('support')
        .from('tickets')
        .update({
          status: 'cancelled',
          cancellation_reason: trimmed,
          resolved_by_staff_id: staffId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      toast.success('Ticket rechazado.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
