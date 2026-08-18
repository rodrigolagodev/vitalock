import type { TypedSupabaseClient } from '../client';

export interface ResolveEquipmentUpdateInput {
  taskId: string;
  actorStaffId?: string | null;
}

export interface ResolveEquipmentUpdateResult {
  ticket_id: string;
  skipped_key_ids: string[];
}

export async function resolveEquipmentUpdate(
  client: TypedSupabaseClient,
  input: ResolveEquipmentUpdateInput,
): Promise<ResolveEquipmentUpdateResult> {
  const { data, error } = await client.rpc('resolve_equipment_update', {
    p_task_id: input.taskId,
    p_actor_staff_id: (input.actorStaffId ?? null) as unknown as string,
  });
  if (error) throw error;
  const payload = data as unknown as ResolveEquipmentUpdateResult;
  return {
    ticket_id: payload.ticket_id,
    skipped_key_ids: Array.isArray(payload.skipped_key_ids) ? payload.skipped_key_ids : [],
  };
}
