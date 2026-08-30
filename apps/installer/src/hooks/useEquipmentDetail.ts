import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  equipmentByIdKey,
  equipmentMaintenanceHistoryKey,
  equipmentUpdateHistoryKey,
} from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentDetail {
  id: string;
  serial_number: string;
  model: string | null;
  status: string;
  description: string | null;
  access_type: string | null;
  building_id: string | null;
}

export interface MaintenanceHistoryRow {
  id: string;
  title: string;
  status: string;
  category: string;
  opened_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export interface EquipmentUpdateHistoryRow {
  id: string;
  created_at: string;
  resolved_at: string;
  mdb_storage_path: string;
  keys_to_activate: string[];
  keys_to_disable: string[];
}

// ---------------------------------------------------------------------------
// useEquipmentById — operations.equipment for the task's target equipment
// ---------------------------------------------------------------------------

export function useEquipmentById(equipmentId: string | null) {
  return useQuery({
    queryKey: equipmentByIdKey(equipmentId ?? 'none'),
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<EquipmentDetail | null> => {
      if (!equipmentId) return null;

      const { data, error } = await supabase
        .schema('operations')
        .from('equipment')
        .select('id, serial_number, model, status, description, access_type, building_id')
        .eq('id', equipmentId)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as unknown as EquipmentDetail | null;
    },
  });
}

// ---------------------------------------------------------------------------
// useMaintenanceHistory — prior maintenance tickets on the same equipment
// ---------------------------------------------------------------------------

/**
 * Fetches the equipment's prior maintenance resolve list. RLS scopes this to
 * tickets historically assigned to the current installer, so it reflects the
 * work this installer can see on the equipment.
 */
export function useMaintenanceHistory(equipmentId: string | null) {
  return useQuery({
    queryKey: equipmentMaintenanceHistoryKey(equipmentId ?? 'none'),
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<MaintenanceHistoryRow[]> => {
      if (!equipmentId) return [];

      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .select('id, description, status, category, opened_at, resolved_at, resolution_notes')
        .eq('equipment_id', equipmentId)
        .eq('category', 'maintenance')
        .in('status', ['resolved', 'cancelled'])
        .order('resolved_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      return (data ?? []).map((r) => ({
        id: r.id,
        title: r.description,
        status: r.status,
        category: r.category,
        opened_at: r.opened_at,
        resolved_at: r.resolved_at,
        resolution_notes: r.resolution_notes,
      })) as unknown as MaintenanceHistoryRow[];
    },
  });
}

// ---------------------------------------------------------------------------
// useEquipmentUpdateHistory — prior resolved updates on the same equipment
// ---------------------------------------------------------------------------

/**
 * Fetches resolved equipment_updates for a controller. Mirrors the admin's
 * view but RLS-scoped to tickets assigned to the current installer.
 */
export function useEquipmentUpdateHistory(equipmentId: string | null) {
  return useQuery({
    queryKey: equipmentUpdateHistoryKey(equipmentId ?? 'none'),
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<EquipmentUpdateHistoryRow[]> => {
      if (!equipmentId) return [];

      const { data, error } = await supabase
        .schema('support')
        .from('equipment_updates')
        .select('id, created_at, resolved_at, mdb_storage_path, keys_to_activate, keys_to_disable')
        .eq('equipment_id', equipmentId)
        .not('resolved_at', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []) as unknown as EquipmentUpdateHistoryRow[];
    },
  });
}
