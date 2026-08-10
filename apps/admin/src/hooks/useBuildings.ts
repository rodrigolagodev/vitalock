import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildingsKey } from '@/lib/queryKeys';

export interface BuildingRow {
  id: string;
  name: string;
  address: string | null;
  status: string;
  administration_id: string;
  key_count: number;
  equipment_count: number;
}

export function useBuildings({ administrationId }: { administrationId?: string } = {}) {
  return useQuery({
    queryKey: buildingsKey(administrationId),
    queryFn: async (): Promise<BuildingRow[]> => {
      let query = supabase
        .from('buildings')
        .select('id, name, address, status, administration_id')
        .order('name');

      if (administrationId) {
        query = query.eq('administration_id', administrationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch child counts separately to avoid cross-schema embedding issues
      const buildingIds = (data ?? []).map((b) => b.id);

      const keyCounts: Record<string, number> = {};
      const equipmentCounts: Record<string, number> = {};

      if (buildingIds.length > 0) {
        // Keys live under units, so we join client-side via unit_id → building_id
        const { data: units } = await supabase
          .from('units')
          .select('id, building_id')
          .in('building_id', buildingIds);

        const unitToBuilding = new Map(
          (units ?? []).map((u) => [u.id, u.building_id]),
        );
        const unitIds = [...unitToBuilding.keys()];

        if (unitIds.length > 0) {
          const { data: keys } = await supabase
            .from('rfid_keys')
            .select('unit_id, status')
            .in('unit_id', unitIds)
            .eq('status', 'active');

          for (const k of keys ?? []) {
            const buildingId = unitToBuilding.get(k.unit_id);
            if (buildingId) {
              keyCounts[buildingId] = (keyCounts[buildingId] ?? 0) + 1;
            }
          }
        }

        const { data: equipment } = await supabase
          .schema('operations')
          .from('equipment')
          .select('building_id, status')
          .in('building_id', buildingIds);

        for (const e of equipment ?? []) {
          if (e.status === 'active') {
            equipmentCounts[e.building_id] =
              (equipmentCounts[e.building_id] ?? 0) + 1;
          }
        }
      }

      return (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        status: b.status,
        administration_id: b.administration_id,
        key_count: keyCounts[b.id] ?? 0,
        equipment_count: equipmentCounts[b.id] ?? 0,
      }));
    },
  });
}
