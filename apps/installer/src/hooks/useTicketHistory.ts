import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthContext } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';

export interface HistoricalTicket {
  id: string;
  title: string;
  status: 'resolved' | 'cancelled';
  category: string;
  opened_at: string;
  closed_at: string;
  resolution_notes: string | null;
  cancellation_reason: string | null;
  building: {
    id: string;
    name: string;
    administration: { id: string; company_name: string };
  };
}

function historicalTicketsKey(staffId: string) {
  return ['installer', 'ticket-history', staffId] as const;
}

async function fetchHistoricalTickets(staffId: string): Promise<HistoricalTicket[]> {
  // Single view query — support.installer_tickets_with_context (migration
  // 000110) resolves the cross-schema tickets + buildings + administrations
  // JOIN that PostgREST cannot embed directly.
  const { data, error } = await supabase
    .schema('support')
    .from('installer_tickets_with_context')
    .select(
      `
      id,
      description,
      status,
      category,
      opened_at,
      updated_at,
      resolved_at,
      resolution_notes,
      cancellation_reason,
      building_id,
      building_name,
      building_administration_id,
      administration_company_name
    `,
    )
    .eq('assigned_to_staff_id', staffId)
    .in('status', ['resolved', 'cancelled'])
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    description: string;
    status: 'resolved' | 'cancelled';
    category: string;
    opened_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolution_notes: string | null;
    cancellation_reason: string | null;
    building_id: string | null;
    building_name: string | null;
    building_administration_id: string | null;
    administration_company_name: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    title: r.description,
    status: r.status,
    category: r.category,
    opened_at: r.opened_at,
    // resolved tickets carry resolved_at; cancelled tickets don't, so fall
    // back to updated_at (set by the status-change trigger) as the effective
    // close time. Both feed the timeline the installer sees.
    closed_at: r.resolved_at ?? r.updated_at,
    resolution_notes: r.resolution_notes,
    cancellation_reason: r.cancellation_reason,
    building: r.building_id
      ? {
          id: r.building_id,
          name: r.building_name ?? '',
          administration: r.building_administration_id
            ? {
                id: r.building_administration_id,
                company_name: r.administration_company_name ?? '',
              }
            : { id: '', company_name: '' },
        }
      : { id: '', name: '', administration: { id: '', company_name: '' } },
  }));
}

export function useTicketHistory(): UseQueryResult<HistoricalTicket[]> {
  const { staff } = useAuthContext();
  const staffId = staff?.id ?? '';

  return useQuery({
    queryKey: historicalTicketsKey(staffId),
    queryFn: () => fetchHistoricalTickets(staffId),
    enabled: !!staffId,
  });
}
