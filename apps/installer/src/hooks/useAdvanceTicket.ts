import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/auth/AuthProvider';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveInput {
  ticketId: string;
  resolution_notes: string;
}

// ---------------------------------------------------------------------------
// Hook — pessimistic resolve mutation
//
// Design contract: resolved_by_staff_id is ALWAYS included in the payload.
// It is read from useAuthContext() at hook-call time and NEVER omitted.
// A dedicated Vitest test (3.5) enforces this contract in CI.
// ---------------------------------------------------------------------------

export function useAdvanceTicket() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async ({ ticketId, resolution_notes }: ResolveInput) => {
      const { error } = await supabase
        .schema('support')
        .from('tickets')
        .update({
          status: 'resolved',
          resolution_notes,
          // resolved_by_staff_id is NEVER omitted — design decision §resolved_by_staff_id
          resolved_by_staff_id: staffId,
        })
        .eq('id', ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      toast.success('Ticket resuelto correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });
}
