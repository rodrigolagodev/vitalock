import type { TypedSupabaseClient } from '../client';
import { definedRpcArgs } from '../types/rpc';

/**
 * Wrappers around the ticket-resolution RPCs.
 *
 * Every argument these RPCs treat as "optional" is declared `DEFAULT NULL` in
 * SQL, which `supabase gen types` renders as an *optional* property rather
 * than a nullable one. `definedRpcArgs` drops the nullish entries so the key
 * is omitted and the SQL default applies — exactly what sending an explicit
 * null used to achieve, but expressible in the generated types.
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
    ...definedRpcArgs({
      p_unit_id: input.unitId,
      p_note: input.note,
      p_actor_staff_id: input.actorStaffId,
    }),
  });
  if (error) throw error;
  return data;
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
    ...definedRpcArgs({
      p_new_description: input.newDescription,
      p_note: input.note,
      p_actor_staff_id: input.actorStaffId,
    }),
  });
  if (error) throw error;
  return data;
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
    ...definedRpcArgs({
      p_note: input.note,
      p_actor_staff_id: input.actorStaffId,
    }),
  });
  if (error) throw error;
  return data;
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
    // p_description is a required, non-nullable SQL parameter; '' is the
    // sentinel the RPC expects for "no description".
    p_description: input.description ?? '',
    p_access_type: input.accessType,
  });
  if (error) throw error;
  return data;
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
    ...definedRpcArgs({ p_new_model: input.newModel }),
  });
  if (error) throw error;
}
