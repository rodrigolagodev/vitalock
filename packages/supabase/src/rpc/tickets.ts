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

export interface CreateAndAssignEquipmentInput {
  ticketId: string;
  buildingId: string;
  serial: string;
  model: string;
  description?: string | null;
  accessType: string;
}

/**
 * Atomic replacement for the two-step INSERT+UPDATE previously issued from
 * the admin `useMutateTicketEquipment` hook. Creates the equipment row and
 * links it to the ticket in a single transaction; either both succeed or
 * neither is persisted.
 */
export async function createAndAssignEquipment(
  client: TypedSupabaseClient,
  input: CreateAndAssignEquipmentInput,
): Promise<string> {
  const { data, error } = await client.rpc('create_and_assign_equipment', {
    p_ticket_id: input.ticketId,
    p_building_id: input.buildingId,
    p_serial: input.serial,
    p_model: input.model,
    p_description: (input.description ?? '') as unknown as string,
    p_access_type: input.accessType,
  });
  if (error) throw error;
  return data as string;
}

export interface CompleteAuthorizationsInput {
  installIds: string[];
  removeIds: string[];
  staffId: string;
}

/**
 * Atomic replacement for the two sequential UPDATEs the installer
 * previously issued from useCompleteAuthorizations. Both branches (install
 * and remove) commit or roll back together. `installed_at` / `removed_at`
 * are auto-filled by operations.key_authorizations_sync_timestamps —
 * they cannot be set by the installer role (see migration 20260817000062).
 */
export async function completeAuthorizations(
  client: TypedSupabaseClient,
  input: CompleteAuthorizationsInput,
): Promise<void> {
  const { error } = await client.rpc('complete_authorizations', {
    p_install_ids: input.installIds,
    p_remove_ids: input.removeIds,
    p_staff_id: input.staffId,
  });
  if (error) throw error;
}

export interface ConfigureTechnicalTicketEquipmentInput {
  ticketId: string;
  newSerial: string;
  newModel?: string | null;
}

/**
 * Step 1 of the two-step equipment task flow. Persists the operator-supplied
 * serial (and optional model) on the ticket and transitions it to in_progress.
 * The physical side effects (create/replace equipment, key transfer, stock
 * movements) run at finalize time via resolveTicket.
 */
export async function configureTechnicalTicketEquipment(
  client: TypedSupabaseClient,
  input: ConfigureTechnicalTicketEquipmentInput,
): Promise<void> {
  const { error } = await client.rpc('configure_technical_ticket_equipment', {
    p_ticket_id: input.ticketId,
    p_new_serial: input.newSerial,
    p_new_model: (input.newModel ?? null) as unknown as string,
  });
  if (error) throw error;
}
