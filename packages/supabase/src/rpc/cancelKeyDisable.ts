import type { TypedSupabaseClient } from '../client';

export interface CancelKeyDisableInput {
  keyId: string;
  actorStaffId?: string | null;
  note?: string | null;
}

export async function cancelKeyDisable(
  client: TypedSupabaseClient,
  input: CancelKeyDisableInput,
): Promise<void> {
  const { error } = await client.rpc('cancel_key_disable', {
    p_key_id: input.keyId,
    p_actor_staff_id: (input.actorStaffId ?? null) as unknown as string,
    p_note: (input.note ?? null) as unknown as string,
  });
  if (error) throw error;
}
