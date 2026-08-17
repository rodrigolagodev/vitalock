import type { TypedSupabaseClient } from '../client';

export interface ResolveEquipmentUpdateInput {
  taskId: string;
  actorStaffId?: string | null;
}

export async function resolveEquipmentUpdate(
  client: TypedSupabaseClient,
  input: ResolveEquipmentUpdateInput,
): Promise<string> {
  const { data, error } = await client.rpc('resolve_equipment_update', {
    p_task_id: input.taskId,
    p_actor_staff_id: (input.actorStaffId ?? null) as unknown as string,
  });
  if (error) throw error;
  return data as string;
}
