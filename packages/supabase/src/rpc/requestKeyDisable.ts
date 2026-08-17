import type { TypedSupabaseClient } from '../client';

export interface RequestKeyDisableInput {
  keyId: string;
  actorStaffId?: string | null;
  note?: string | null;
}

export async function requestKeyDisable(
  client: TypedSupabaseClient,
  input: RequestKeyDisableInput,
): Promise<void> {
  const { error } = await client.rpc('request_key_disable', {
    p_key_id: input.keyId,
    p_actor_staff_id: (input.actorStaffId ?? null) as unknown as string,
    p_note: (input.note ?? null) as unknown as string,
  });
  if (error) throw error;
}
