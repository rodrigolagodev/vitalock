import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { tareasKey } from '@/lib/queryKeys';

export interface TareaRow {
  id: string;
  ticket_number: string;
  category:
    | 'maintenance'
    | 'installation'
    | 'key_configuration'
    | 'key_installation'
    | 'equipment_installation';
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  building_id: string;
  building: {
    id: string;
    name: string;
    administration: { id: string; company_name: string } | null;
  } | null;
  assigned_to_staff_id: string | null;
  assigned_to_name: string | null;
  opened_by_staff_id: string | null;
  opened_by_name: string | null;
  opened_at: string;
  updated_at: string;
  resolution_notes: string | null;
  cancellation_reason: string | null;
  notes: string | null;
}

export interface UseTareaFilters {
  search?: string;
  staffId?: string;
  buildingId?: string;
  status?: string;
}

export function useTareas({
  search,
  staffId,
  buildingId,
  status,
}: UseTareaFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: tareasKey(trimmed, staffId, buildingId, status),
    queryFn: async (): Promise<TareaRow[]> => {
      // Note: PostgREST cannot embed cross-schema FKs (support -> public /
      // support -> identity), so we fetch the flat rows and resolve building,
      // administration and staff names with batch lookups.
      let query = supabase
        .schema('support')
        .from('tickets')
        .select(`
          id,
          ticket_number,
          category,
          description,
          status,
          administration_id,
          building_id,
          unit_id,
          equipment_id,
          assigned_to_staff_id,
          opened_by_staff_id,
          opened_at,
          updated_at,
          resolution_notes,
          cancellation_reason,
          notes
        `);

      // Server-side status filter.
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Server-side staff filter.
      if (staffId) {
        query = query.eq('assigned_to_staff_id', staffId);
      }

      // Server-side building filter.
      if (buildingId) {
        query = query.eq('building_id', buildingId);
      }

      // Server-side text search on ticket_number and description.
      if (trimmed) {
        query = query.or(
          `ticket_number.ilike.%${trimmed}%,description.ilike.%${trimmed}%`,
        );
      }

      const { data, error } = await query.order('opened_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as TareaRow[];

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

      // Batch lookup of staff names for assigned_to and opened_by.
      const staffIds = [
        ...new Set(
          rows
            .flatMap((r) => [r.assigned_to_staff_id, r.opened_by_staff_id])
            .filter((v): v is string => Boolean(v)),
        ),
      ];

      const staffMap = new Map<string, string>();
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .schema('identity')
          .from('staff')
          .select('id, full_name')
          .in('id', staffIds);
        for (const s of staff ?? []) staffMap.set(s.id, s.full_name);
      }

      let result = rows.map((row) => {
        const buildingInfo = row.building_id ? buildingMap.get(row.building_id) : undefined;
        const administration = buildingInfo?.administration_id
          ? administrationMap.get(buildingInfo.administration_id)
          : undefined;
        return {
          ...row,
          status: row.status as TareaRow['status'],
          category: row.category as TareaRow['category'],
          building: buildingInfo
            ? {
                id: buildingInfo.id,
                name: buildingInfo.name,
                administration: administration ?? null,
              }
            : null,
          assigned_to_name: row.assigned_to_staff_id
            ? staffMap.get(row.assigned_to_staff_id) ?? null
            : null,
          opened_by_name: row.opened_by_staff_id
            ? staffMap.get(row.opened_by_staff_id) ?? null
            : null,
        };
      });

      // Client-side search on building name and assigned staff name.
      if (trimmed) {
        const q = trimmed.toLowerCase();
        result = result.filter((row) => {
          const buildingName = row.building?.name.toLowerCase() ?? '';
          const assignedName = row.assigned_to_name?.toLowerCase() ?? '';
          return buildingName.includes(q) || assignedName.includes(q);
        });
      }

      return result;
    },
  });
}
