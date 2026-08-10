import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keysKey } from '@/lib/queryKeys';

export interface KeyRow {
  id: string;
  rfid_code: string;
  status: 'active' | 'disabled';
  notes: string | null;
  activated_at: string;
  deactivated_at: string | null;
  picked_up_at: string | null;
  picked_up_by_name: string | null;
  picked_up_by_surname: string | null;
  picked_up_by_dni: string | null;
  delivered_by_staff_id: string | null;
  unit_id: string;
  unit: {
    id: string;
    number: string;
    unit_type: string | null;
    is_administrative: boolean;
    status: string;
  };
}

export function useKeys(buildingId: string | undefined) {
  return useQuery({
    queryKey: keysKey(buildingId),
    enabled: Boolean(buildingId),
    queryFn: async (): Promise<KeyRow[]> => {
      if (!buildingId) return [];

      const { data: units, error: uErr } = await supabase
        .from('units')
        .select('id, number, unit_type, is_administrative, status')
        .eq('building_id', buildingId);
      if (uErr) throw uErr;

      const unitIds = (units ?? []).map((u) => u.id);
      if (unitIds.length === 0) return [];

      const { data: keys, error: kErr } = await supabase
        .from('rfid_keys')
        .select(
          'id, rfid_code, status, notes, activated_at, deactivated_at, picked_up_at, picked_up_by_name, picked_up_by_surname, picked_up_by_dni, delivered_by_staff_id, unit_id',
        )
        .in('unit_id', unitIds)
        .order('rfid_code');
      if (kErr) throw kErr;

      const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
      return (keys ?? []).map((k) => ({
        ...k,
        status: k.status as KeyRow['status'],
        unit: unitMap.get(k.unit_id)!,
      }));
    },
  });
}
