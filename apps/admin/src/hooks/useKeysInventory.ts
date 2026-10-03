import { useQuery } from '@tanstack/react-query';
import {
  fetchCappedList,
  toCappedQueryResult,
  type CappedList,
  type CappedQueryResult,
} from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { keysInventoryKey } from '@/lib/queryKeys';

export interface KeysInventoryRow {
  id: string | null;
  rfid_code: string | null;
  physical_status: string | null;
  unit_id: string | null;
  unit_number: string | null;
  building_id: string | null;
  building_name: string | null;
  administration_id: string | null;
  administration_company_name: string | null;
  equipment_id: string | null;
  equipment_serial_number: string | null;
  equipment_model: string | null;
  active_order_id: string | null;
  active_order_status: string | null;
}

export interface UseKeysInventoryFilters {
  administrationId?: string;
  buildingId?: string;
  equipmentId?: string;
  /** rfid_keys.status domain value, or 'all' for no filter */
  physicalStatus?: string;
  /**
   * Workflow status filter.
   * '__none__' → keys with no active order (active_order_id IS NULL).
   * 'all' → no filter.
   * any other value → .eq('active_order_status', value).
   */
  workflowStatus?: string;
}

export function useKeysInventory({
  administrationId,
  buildingId,
  equipmentId,
  physicalStatus,
  workflowStatus,
}: UseKeysInventoryFilters = {}): CappedQueryResult<KeysInventoryRow> {
  const result = useQuery({
    queryKey: keysInventoryKey(
      administrationId,
      buildingId,
      equipmentId,
      physicalStatus,
      workflowStatus,
    ),
    queryFn: async (): Promise<CappedList<KeysInventoryRow>> => {
      let query = supabase.from('keys_inventory').select('*', { count: 'exact' });

      if (administrationId) {
        query = query.eq('administration_id', administrationId);
      }

      if (buildingId) {
        query = query.eq('building_id', buildingId);
      }

      if (equipmentId) {
        query = query.eq('equipment_id', equipmentId);
      }

      if (physicalStatus && physicalStatus !== 'all') {
        query = query.eq('physical_status', physicalStatus);
      }

      if (workflowStatus && workflowStatus !== 'all') {
        if (workflowStatus === '__none__') {
          query = query.is('active_order_id', null);
        } else {
          query = query.eq('active_order_status', workflowStatus);
        }
      }

      return fetchCappedList<KeysInventoryRow>(query.order('rfid_code', { ascending: true }));
    },
  });
  return toCappedQueryResult(result);
}
