import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger, useAuthContext } from '@vitalock/shared';
import { assignedTicketsKey } from '@/lib/queryKeys';
import {
  INSTALLER_TICKET_VIEW_COLUMNS,
  mapInstallerTicketRows,
  type AssignedTicket,
  type EquipmentUpdateSnapshot,
  type InstallerTicketViewRow,
  type TicketDetail,
} from '@/lib/tickets/installerTicketRows';

const log = logger('useAssignedTickets');

// ---------------------------------------------------------------------------
// Types — shared with useTicket so the worklist and the detail never diverge.
// ---------------------------------------------------------------------------

export type { AssignedTicket, EquipmentUpdateSnapshot, TicketDetail };

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchAssignedTickets(staffId: string): Promise<AssignedTicket[]> {
  // Single view query resolves the ticket + building + administration
  // context. support.installer_tickets_with_context (migration 000110)
  // handles the cross-schema JOIN PostgREST cannot embed directly.
  const { data, error } = await supabase
    .schema('support')
    .from('installer_tickets_with_context')
    .select(INSTALLER_TICKET_VIEW_COLUMNS)
    .eq('assigned_to_staff_id', staffId)
    .in('status', ['open', 'in_progress']);

  if (error) throw error;

  return mapInstallerTicketRows((data ?? []) as unknown as InstallerTicketViewRow[]);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssignedTickets(): UseQueryResult<AssignedTicket[]> {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  const query = useQuery({
    queryKey: assignedTicketsKey(staffId),
    queryFn: () => fetchAssignedTickets(staffId),
    enabled: !!staffId,
  });

  useEffect(() => {
    if (!staffId) return;

    let channel = supabase.channel(`assigned-tickets-${staffId}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'support',
        table: 'tickets',
        filter: `assigned_to_staff_id=eq.${staffId}`,
      },
      () => {
        void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      },
    );

    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR') {
        log.warn('Realtime filter rejected, re-subscribing filterless.', err);
        void supabase.removeChannel(channel);

        // Re-subscribe without filter; query's own WHERE clause scopes the data
        channel = supabase
          .channel(`assigned-tickets-filterless-${staffId}`)
          .on('postgres_changes', { event: '*', schema: 'support', table: 'tickets' }, () => {
            void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
          })
          .subscribe();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffId, queryClient]);

  return query;
}
