import type { TypedSupabaseClient } from '../client';

/**
 * Wrappers around the ticket-resolution RPCs.
 *
 * These RPCs accept nullable arguments at the SQL level (the function bodies
 * gate on `is not null`), but `supabase gen types` marks them non-nullable
 * because the SQL signature has no `default null` for those params. The
 * casts here are the single place where that mismatch is absorbed — callers
 * pass domain-shaped inputs and never see the shape divergence.
 */

export interface ResolveEquipmentInstallationInput {
  ticketId: string;
  serial: string;
  unitId?: string | null;
  note?: string | null;
  actorStaffId?: string | null;
}

export async function resolveEquipmentInstallation(
  client: TypedSupabaseClient,
  input: ResolveEquipmentInstallationInput,
): Promise<string> {
  const { data, error } = await client.rpc('resolve_equipment_installation', {
    p_ticket_id: input.ticketId,
    p_serial: input.serial,
    // SQL accepts null; typegen omits the nullable flag → cast.
    p_unit_id: (input.unitId ?? null) as unknown as string,
    p_note: (input.note ?? null) as unknown as string,
    ...(input.actorStaffId != null && { p_actor_staff_id: input.actorStaffId }),
  });
  if (error) throw error;
  return data as string;
}

export interface ResolveEquipmentReplacementInput {
  ticketId: string;
  oldEquipmentId: string;
  newSerial: string;
  newModel: string;
  newDescription?: string | null;
  note?: string | null;
  actorStaffId?: string | null;
}

export async function resolveEquipmentReplacement(
  client: TypedSupabaseClient,
  input: ResolveEquipmentReplacementInput,
): Promise<string> {
  const { data, error } = await client.rpc('resolve_equipment_replacement', {
    p_ticket_id: input.ticketId,
    p_old_equipment_id: input.oldEquipmentId,
    p_new_serial: input.newSerial,
    p_new_model: input.newModel,
    p_new_description: (input.newDescription ?? null) as unknown as string,
    p_note: (input.note ?? null) as unknown as string,
    ...(input.actorStaffId != null && { p_actor_staff_id: input.actorStaffId }),
  });
  if (error) throw error;
  return data as string;
}

export interface ResolveTicketInput {
  ticketId: string;
  note?: string | null;
  actorStaffId?: string | null;
}

export async function resolveTicket(
  client: TypedSupabaseClient,
  input: ResolveTicketInput,
): Promise<string> {
  const { data, error } = await client.rpc('resolve_ticket', {
    p_ticket_id: input.ticketId,
    p_note: (input.note ?? null) as unknown as string,
    ...(input.actorStaffId != null && { p_actor_staff_id: input.actorStaffId }),
  });
  if (error) throw error;
  return data as string;
}
