import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthContext } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { ticketKey } from '@/lib/queryKeys';
import type { TareaStatus } from '@/lib/status/tareaStatus';
import {
  INSTALLER_TICKET_VIEW_COLUMNS,
  mapInstallerTicketRows,
  type InstallerTicketViewRow,
  type TicketDetail,
} from '@/lib/tickets/installerTicketRows';

type TicketDetailViewRow = InstallerTicketViewRow & {
  updated_at: string;
  resolved_at: string | null;
  resolved_by_staff_id: string | null;
  resolution_notes: string | null;
  cancellation_reason: string | null;
};

/**
 * Fetches one ticket regardless of status. The worklist query filters to
 * open/in_progress, so a resolved or cancelled task would otherwise 404 on
 * the detail. RLS (installer_read_own_tickets) only checks assignment, so
 * closed tickets remain readable by the installer they were assigned to.
 */
async function fetchTicket(staffId: string, ticketId: string): Promise<TicketDetail | null> {
  const { data, error } = await supabase
    .schema('support')
    .from('installer_tickets_with_context')
    .select(
      `${INSTALLER_TICKET_VIEW_COLUMNS},
      updated_at,
      resolved_at,
      resolved_by_staff_id,
      resolution_notes,
      cancellation_reason
    `,
    )
    .eq('id', ticketId)
    .eq('assigned_to_staff_id', staffId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as TicketDetailViewRow;
  const [base] = await mapInstallerTicketRows([row]);
  if (!base) return null;

  return {
    ...base,
    status: row.status as TareaStatus,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    resolved_by_staff_id: row.resolved_by_staff_id,
    resolution_notes: row.resolution_notes,
    cancellation_reason: row.cancellation_reason,
  };
}

export function useTicket(id: string | undefined): UseQueryResult<TicketDetail | null> {
  const { staff } = useAuthContext();
  const staffId = staff?.id ?? '';
  const ticketId = id ?? '';

  return useQuery({
    queryKey: ticketKey(ticketId),
    queryFn: () => fetchTicket(staffId, ticketId),
    enabled: !!staffId && !!ticketId,
  });
}
