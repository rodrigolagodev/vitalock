import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface KeyEventRow {
  id: string;
  key_id: string;
  event_type: 'activated' | 'deactivated';
  note: string | null;
  actor_staff_id: string | null;
  actor_name: string | null;
  occurred_at: string;
}

export const keyEventsKey = (keyId: string | undefined) =>
  ['admin', 'key-events', keyId ?? 'none'] as const;

export function useKeyEvents(keyId: string | undefined) {
  return useQuery({
    queryKey: keyEventsKey(keyId),
    enabled: Boolean(keyId),
    queryFn: async (): Promise<KeyEventRow[]> => {
      if (!keyId) return [];

      const { data: events, error } = await supabase
        .from('key_events')
        .select('id, key_id, event_type, note, actor_staff_id, occurred_at')
        .eq('key_id', keyId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;

      const staffIds = [...new Set((events ?? []).map((e) => e.actor_staff_id).filter((v): v is string => Boolean(v)))];
      const staffMap = new Map<string, string>();
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .schema('identity')
          .from('staff')
          .select('id, full_name')
          .in('id', staffIds);
        for (const s of staff ?? []) staffMap.set(s.id, s.full_name);
      }

      return (events ?? []).map((e) => ({
        ...e,
        event_type: e.event_type as KeyEventRow['event_type'],
        actor_name: e.actor_staff_id ? staffMap.get(e.actor_staff_id) ?? null : null,
      }));
    },
  });
}
