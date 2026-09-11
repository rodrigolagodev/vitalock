import type { TypedSupabaseClient } from '../client';
import { definedRpcArgs } from '../types/rpc';

export interface CreateEquipmentUpdateInput {
  equipmentId: string;
  administrationId: string;
  buildingId: string;
  description: string;
  mdbStoragePath: string;
  keysToActivate?: string[];
  keysToDisable?: string[];
  actorStaffId?: string | null;
  /** Staff assigned to resolve the ticket. When null the ticket lands unassigned. */
  assignedToStaffId?: string | null;
}

export async function createEquipmentUpdate(
  client: TypedSupabaseClient,
  input: CreateEquipmentUpdateInput,
): Promise<string> {
  const { data, error } = await client.rpc('create_equipment_update', {
    p_equipment_id: input.equipmentId,
    p_administration_id: input.administrationId,
    p_building_id: input.buildingId,
    p_description: input.description,
    p_mdb_storage_path: input.mdbStoragePath,
    // These two DEFAULT '{}' in SQL; `?? []` reproduces that default verbatim.
    p_keys_to_activate: input.keysToActivate ?? [],
    p_keys_to_disable: input.keysToDisable ?? [],
    // Both staff ids DEFAULT NULL in SQL, so omitting them is equivalent to
    // sending an explicit null (see types/rpc.ts).
    ...definedRpcArgs({
      p_actor_staff_id: input.actorStaffId,
      p_assigned_to_staff_id: input.assignedToStaffId,
    }),
  });
  if (error) throw error;
  return data;
}
