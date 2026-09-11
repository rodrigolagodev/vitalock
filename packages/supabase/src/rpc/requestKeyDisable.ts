import type { TypedSupabaseClient } from '../client';
import { definedRpcArgs } from '../types/rpc';

export interface RequestKeyDisableInput {
  keyId: string;
  actorStaffId?: string | null;
  note?: string | null;
}

export async function requestKeyDisable(
  client: TypedSupabaseClient,
  input: RequestKeyDisableInput,
): Promise<void> {
  // p_actor_staff_id and p_note both DEFAULT NULL in SQL, so omitting them is
  // equivalent to sending an explicit null (see types/rpc.ts).
  const { error } = await client.rpc('request_key_disable', {
    p_key_id: input.keyId,
    ...definedRpcArgs({
      p_actor_staff_id: input.actorStaffId,
      p_note: input.note,
    }),
  });
  if (error) throw error;
}
