import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Given a list of rfid_key UUIDs, returns a Map<uuid, rfid_code> for display.
 * The map is empty while loading or on error, so callers can fall back to UUID slices.
 */
export function useRfidKeyCodeMap(keyIds: string[]): Map<string, string> {
  const stable = keyIds.slice().sort().join(',');

  const { data } = useQuery({
    queryKey: ['rfid-key-codes', stable],
    queryFn: async () => {
      if (keyIds.length === 0) return [];
      const { data, error } = await supabase
        .from('rfid_keys')
        .select('id, rfid_code')
        .in('id', keyIds);
      if (error) throw error;
      return (data ?? []) as { id: string; rfid_code: string }[];
    },
    enabled: keyIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id, row.rfid_code);
  }
  return map;
}
