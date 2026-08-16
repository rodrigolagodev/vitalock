import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@vitalock/shared';
import { ticketCommentsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';
import type { TicketComment } from './useTicketComments';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddCommentInput {
  ticketId: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Hook — optimistic insert via TanStack onMutate cache patch
//
// Flow:
//   onMutate  → append pending comment (id: crypto.randomUUID(), _pending: true)
//   onSuccess → invalidate to replace with confirmed DB row
//   onError   → revert to snapshot + toastMutationError
// ---------------------------------------------------------------------------

export function useAddComment() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: async ({ ticketId, body }: AddCommentInput) => {
      const { error } = await supabase
        .schema('support')
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          body,
          author_staff_id: staffId || null,
        });

      if (error) throw error;
    },

    onMutate: async ({ ticketId, body }) => {
      const queryKey = ticketCommentsKey(ticketId);

      // Cancel in-flight queries so they don't overwrite the optimistic update
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the current cache value for rollback
      const snapshot = queryClient.getQueryData<TicketComment[]>(queryKey);

      // Optimistically append the pending comment
      const pendingComment: TicketComment = {
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        body,
        created_at: new Date().toISOString(),
        author_staff_id: staffId || null,
        author_full_name: staff?.full_name ?? null,
        _pending: true,
      };

      queryClient.setQueryData<TicketComment[]>(queryKey, (prev) => [
        ...(prev ?? []),
        pendingComment,
      ]);

      return { snapshot, ticketId };
    },

    onSuccess: (_data, { ticketId }) => {
      // Invalidate so the query re-fetches the confirmed row from DB
      void queryClient.invalidateQueries({ queryKey: ticketCommentsKey(ticketId) });
    },

    onError: (err, _vars, context) => {
      // Revert to snapshot
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(
          ticketCommentsKey(context.ticketId),
          context.snapshot,
        );
      }
      toastMutationError(err);
    },
  });
}
