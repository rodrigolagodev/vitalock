import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthContext } from '@vitalock/shared';
import { supabase } from '@/main';

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

export function historicalTicketsKey(staffId: string) {
  return ['installer', 'ticket-history', staffId] as const;
}

async function fetchHistoricalTickets(staffId: string): Promise<HistoricalTicket[]> {
  // PostgREST cannot embed cross-schema FKs (support -> public), so we
  // fetch flat rows and resolve building + administration names in batch.
  const { data, error } = await supabase
    .schema('support')
    .from('tickets')
    .select(`
      id,
      description,
      status,
      category,
      opened_at,
      updated_at,
      resolved_at,
      resolution_notes,
      cancellation_reason,
      building_id
    `)
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
  }[];

  const buildingIds = [
    ...new Set(rows.map((r) => r.building_id).filter((v): v is string => Boolean(v))),
  ];
  const buildingMap = new Map<
    string,
    { id: string; name: string; administration_id: string | null }
  >();
  if (buildingIds.length > 0) {
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, name, administration_id')
      .in('id', buildingIds);
    for (const b of buildings ?? []) {
      buildingMap.set(b.id, {
        id: b.id,
        name: b.name,
        administration_id: b.administration_id,
      });
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

export function useTicketHistory(): UseQueryResult<HistoricalTicket[]> {
  const { staff } = useAuthContext();
  const staffId = staff?.id ?? '';

  return useQuery({
    queryKey: historicalTicketsKey(staffId),
    queryFn: () => fetchHistoricalTickets(staffId),
    enabled: !!staffId,
  });
}
