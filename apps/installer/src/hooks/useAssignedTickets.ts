import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@vitalock/shared';
import { assignedTicketsKey } from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssignedTicket {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress';
  category: 'maintenance' | 'installation' | 'equipment_installation' | 'equipment_replacement' | string;
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
  // Note: PostgREST cannot embed cross-schema FKs (support -> public), so we
  // fetch flat rows and resolve building + administration names with batch
  // lookups. An embed like building:building_id(...) fails with PGRST200.
  const { data, error } = await supabase
    .schema('support')
    .from('tickets')
    .select(`
      id,
      description,
      status,
      category,
      opened_at,
      building_id
    `)
    .eq('assigned_to_staff_id', staffId)
    .in('status', ['open', 'in_progress']);

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    description: string;
    status: string;
    category: string;
    opened_at: string;
    building_id: string | null;
  }[];

  // Batch lookup of building names + their administration.
  const buildingIds = [
    ...new Set(rows.map((r) => r.building_id).filter((v): v is string => Boolean(v))),
  ];
  const buildingMap = new Map<string, { id: string; name: string; administration_id: string | null }>();
  if (buildingIds.length > 0) {
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, name, administration_id')
      .in('id', buildingIds);
    for (const b of buildings ?? []) {
      buildingMap.set(b.id, { id: b.id, name: b.name, administration_id: b.administration_id });
    }
  }

  const administrationIds = [
    ...new Set(
      [...buildingMap.values()]
        .map((b) => b.administration_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const administrationMap = new Map<string, { id: string; company_name: string }>();
  if (administrationIds.length > 0) {
    const { data: administrations } = await supabase
      .from('administrations')
      .select('id, company_name')
      .in('id', administrationIds);
    for (const a of administrations ?? []) {
      administrationMap.set(a.id, { id: a.id, company_name: a.company_name });
    }
  }

  return rows.map((r) => {
    const buildingInfo = r.building_id ? buildingMap.get(r.building_id) : undefined;
    const administration = buildingInfo?.administration_id
      ? administrationMap.get(buildingInfo.administration_id)
      : undefined;

    return {
      id: r.id,
      // title maps to description (no separate title column in DB)
      title: r.description,
      description: r.description,
      status: r.status as 'open' | 'in_progress',
      category: r.category,
      opened_at: r.opened_at,
      building: buildingInfo
        ? {
            id: buildingInfo.id,
            name: buildingInfo.name,
            administration: administration ?? { id: '', company_name: '' },
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
