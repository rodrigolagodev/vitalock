import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface EquipmentUpdateRow {
  id: string;
  ticket_id: string;
  equipment_id: string;
  mdb_storage_path: string;
  keys_to_activate: string[];
  keys_to_disable: string[];
  created_at: string;
  created_by_staff_id: string | null;
  resolved_at: string | null;
  resolved_by_staff_id: string | null;
  ticket_status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
}

export const equipmentUpdatesKey = (equipmentId: string) =>
  ['admin', 'equipment-updates', equipmentId] as const;

export function useEquipmentUpdates(equipmentId: string | undefined) {
  return useQuery({
    queryKey: equipmentUpdatesKey(equipmentId ?? ''),
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<EquipmentUpdateRow[]> => {
      if (!equipmentId) return [];

      const { data: updates, error: updErr } = await supabase
        .schema('support')
        .from('equipment_updates')
        .select(
          'id, ticket_id, equipment_id, mdb_storage_path, keys_to_activate, keys_to_disable, created_at, created_by_staff_id, resolved_at, resolved_by_staff_id',
        )
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false });
      if (updErr) throw updErr;

      const rows = (updates ?? []) as unknown as Omit<EquipmentUpdateRow, 'ticket_status'>[];

      if (rows.length === 0) return [];

      const ticketIds = rows.map((r) => r.ticket_id);
      const { data: tickets, error: tErr } = await supabase
        .schema('support')
        .from('tickets')
        .select('id, status')
        .in('id', ticketIds);
      if (tErr) throw tErr;

      const ticketStatusMap = new Map(
        (tickets ?? []).map((t) => [t.id, t.status as EquipmentUpdateRow['ticket_status']]),
      );

      return rows.map((r) => ({
        ...r,
        ticket_status: ticketStatusMap.get(r.ticket_id) ?? 'open',
      }));
    },
  });
}
