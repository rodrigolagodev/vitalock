import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/auth/AuthProvider';
import { assignedTicketsKey } from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssignedTicket {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress';
  opened_at: string;
  building: {
    id: string;
    name: string;
    administration: { id: string; company_name: string };
  };
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchAssignedTickets(staffId: string): Promise<AssignedTicket[]> {
  // Note: support.tickets has no 'title' column; 'description' serves as the
  // display title (short summary). We alias it here for the hook contract.
  const { data, error } = await supabase
    .schema('support')
    .from('tickets')
    .select(`
      id,
      description,
      status,
      opened_at,
      building:building_id(
        id,
        name,
        administration:administration_id(id, company_name)
      )
    `)
    .eq('assigned_to_staff_id', staffId)
    .in('status', ['open', 'in_progress']);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      description: string;
      status: string;
      opened_at: string;
      building: {
        id: string;
        name: string;
        administration: { id: string; company_name: string } | null;
      } | null;
    };

    return {
      id: r.id,
      // title maps to description (no separate title column in DB)
      title: r.description,
      description: r.description,
      status: r.status as 'open' | 'in_progress',
      opened_at: r.opened_at,
      building: r.building
        ? {
            id: r.building.id,
            name: r.building.name,
            administration: r.building.administration ?? { id: '', company_name: '' },
          }
        : { id: '', name: '', administration: { id: '', company_name: '' } },
    };
  });
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

    let channel = supabase
      .channel(`assigned-tickets-${staffId}`)
      .on(
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
        console.warn(
          '[useAssignedTickets] Realtime filter rejected, re-subscribing filterless. Error:',
          err,
        );
        void supabase.removeChannel(channel);

        // Re-subscribe without filter; query's own WHERE clause scopes the data
        channel = supabase
          .channel(`assigned-tickets-filterless-${staffId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'support', table: 'tickets' },
            () => {
              void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
            },
          )
          .subscribe();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffId, queryClient]);

  return query;
}
