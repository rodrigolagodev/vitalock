import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildingsKey } from '@/lib/queryKeys';

export interface BuildingRow {
  id: string;
  name: string;
  address: string | null;
  status: string;
  administration_id: string;
  unit_count: number;
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

      const unitCounts: Record<string, number> = {};
      const equipmentCounts: Record<string, number> = {};

      if (buildingIds.length > 0) {
        const { data: units } = await supabase
          .from('units')
          .select('building_id, status')
          .in('building_id', buildingIds);

        const { data: equipment } = await supabase
          .schema('operations')
          .from('equipment')
          .select('building_id, status')
          .in('building_id', buildingIds);

        for (const u of units ?? []) {
          if (u.status === 'active') {
            unitCounts[u.building_id] = (unitCounts[u.building_id] ?? 0) + 1;
          }
        }
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
        unit_count: unitCounts[b.id] ?? 0,
        equipment_count: equipmentCounts[b.id] ?? 0,
      }));
    },
  });
}
