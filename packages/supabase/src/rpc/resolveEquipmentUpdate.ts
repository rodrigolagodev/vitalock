import type { TypedSupabaseClient } from '../client';
import { definedRpcArgs } from '../types/rpc';
import { readJsonStringArray, requireJsonObject, requireJsonString } from '../types/json';

export interface ResolveEquipmentUpdateInput {
  taskId: string;
  actorStaffId?: string | null;
}

export interface ResolveEquipmentUpdateResult {
  ticket_id: string;
  skipped_key_ids: string[];
}

const RPC_NAME = 'resolve_equipment_update';

export async function resolveEquipmentUpdate(
  client: TypedSupabaseClient,
  input: ResolveEquipmentUpdateInput,
): Promise<ResolveEquipmentUpdateResult> {
  // p_actor_staff_id DEFAULTs NULL in SQL, so omitting it matches the previous
  // explicit-null call exactly.
  const { data, error } = await client.rpc(RPC_NAME, {
    p_task_id: input.taskId,
    ...definedRpcArgs({ p_actor_staff_id: input.actorStaffId }),
  });
  if (error) throw error;

  // The RPC returns jsonb, so the generated type is only `Json`. Validate the
  // shape here rather than asserting it — the SQL builds
  // jsonb_build_object('ticket_id', uuid, 'skipped_key_ids', to_jsonb(uuid[])).
  const payload = requireJsonObject(data, RPC_NAME);
  return {
    ticket_id: requireJsonString(payload, 'ticket_id', RPC_NAME),
    skipped_key_ids: readJsonStringArray(payload, 'skipped_key_ids'),
  };
}
