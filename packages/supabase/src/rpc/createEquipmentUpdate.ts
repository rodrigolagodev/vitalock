import type { TypedSupabaseClient } from '../client';

export interface CreateEquipmentUpdateInput {
  equipmentId: string;
  administrationId: string;
  buildingId: string;
  description: string;
  mdbStoragePath: string;
  keysToActivate?: string[];
  keysToDisable?: string[];
  actorStaffId?: string | null;
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
    p_keys_to_activate: (input.keysToActivate ?? []) as unknown as string[],
    p_keys_to_disable: (input.keysToDisable ?? []) as unknown as string[],
    p_actor_staff_id: (input.actorStaffId ?? null) as unknown as string,
  });
  if (error) throw error;
  return data as string;
}
