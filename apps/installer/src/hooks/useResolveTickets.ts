import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@vitalock/shared';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

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

      // Resolution goes through public.resolve_ticket, which runs the legal
      // state-machine transition open -> in_progress -> resolved inside one
      // transaction. A direct UPDATE 'open' -> 'resolved' is rejected by
      // support.tickets_validate and would leave the ticket stuck open.
      // PostgREST rpc() resolves with { data, error }; surface any failure.
      const results = await Promise.all(
        ids.map((id) =>
          supabase.rpc('resolve_ticket', { p_ticket_id: id, p_note: notes ?? undefined }),
        ),
      );
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;
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
