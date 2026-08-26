import type { TypedSupabaseClient } from '../client';
import type { Database, Json } from '../database.types';

type KeyOrderRow = Database['public']['Tables']['key_orders']['Row'];
type KeyOrderUpdate = Database['public']['Tables']['key_orders']['Update'];
type KeyOrderItemRow = Database['public']['Tables']['key_order_items']['Row'];

export type KeyOrderClientType = 'administration' | 'particular';

export interface KeyOrderPayload {
  client_type: KeyOrderClientType;
  administration_id?: string | null;
  particular_id?: string | null;
  particular_full_name?: string | null;
  particular_dni?: string | null;
  particular_phone?: string | null;
  particular_email?: string | null;
  notes?: string | null;
}

export type KeyOrderItemType = 'key';

export interface KeyOrderItemPayload {
  item_type: KeyOrderItemType;
  quantity: number;
  description?: string | null;
  building_id: string;
  unit_price: number;
  unit_id?: string | null;
  pickup_particular_id?: string | null;
  product_id?: string | null;
}

export interface KeyOrderItemUpdatePayload extends KeyOrderItemPayload {
  id?: string;
}

export interface UpdateDraftKeyOrderInput {
  orderId: string;
  /** Optimistic-concurrency token — must equal key_orders.updated_at at the DB. */
  expectedUpdatedAt: string;
  patch: Partial<KeyOrderPayload>;
  items: KeyOrderItemUpdatePayload[];
}

export interface ConfigureKeyOrderItemInput {
  orderItemId: string;
  rfidCode: string;
  unitId: string;
  equipmentIds: string[];
}

/**
 * Collapse { data, error } into a single value, throwing on error.
 * Mirrors the pattern in orders.ts.
 */
async function unwrap<T>(
  promise: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as T;
}

// ────────────────────────────────────────────────────────────────────────────
// RPC wrappers — key orders context
// ────────────────────────────────────────────────────────────────────────────

export function createKeyOrderWithItems(
  client: TypedSupabaseClient,
  input: {
    order: KeyOrderPayload;
    items: KeyOrderItemPayload[];
    confirmImmediately?: boolean;
  },
): Promise<string> {
  return unwrap(
    client.rpc('create_key_order_with_items', {
      p_order: input.order as unknown as Json,
      p_items: input.items as unknown as Json[],
      p_confirm_immediately: input.confirmImmediately ?? true,
    }),
  );
}

export async function confirmKeyOrder(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('confirm_key_order', { p_order_id: orderId });
  if (error) throw error;
}

export async function cancelKeyOrder(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('cancel_key_order', { p_order_id: orderId });
  if (error) throw error;
}

export function updateDraftKeyOrderWithItems(
  client: TypedSupabaseClient,
  input: UpdateDraftKeyOrderInput,
): Promise<string> {
  return unwrap(
    client.rpc('update_draft_key_order_with_items', {
      p_order_id: input.orderId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_patch: input.patch as unknown as Json,
      p_items: input.items as unknown as Json[],
    }),
  );
}

export async function markKeyOrderInvoiced(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('mark_key_order_invoiced', { p_order_id: orderId });
  if (error) throw error;
}

export function configureKeyOrderItem(
  client: TypedSupabaseClient,
  input: ConfigureKeyOrderItemInput,
): Promise<string> {
  return unwrap(
    client.rpc('configure_key_order_item', {
      p_order_item_id: input.orderItemId,
      p_rfid_code: input.rfidCode,
      p_unit_id: input.unitId,
      p_equipment_ids: input.equipmentIds,
    }),
  );
}

export async function markKeyOrderItemInstalled(
  client: TypedSupabaseClient,
  orderItemId: string,
): Promise<void> {
  const { error } = await client.rpc('mark_key_order_item_installed', {
    p_order_item_id: orderItemId,
  });
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────────────────
// Direct-table helpers for key_orders and key_order_items
// ────────────────────────────────────────────────────────────────────────────

export async function setKeyOrderPickupPerson(
  client: TypedSupabaseClient,
  input: { orderId: string; pickupParticularId: string | null },
): Promise<void> {
  const patch: KeyOrderUpdate = { pickup_particular_id: input.pickupParticularId };
  const { error } = await client.from('key_orders').update(patch).eq('id', input.orderId);
  if (error) throw error;
}

export type { KeyOrderRow, KeyOrderItemRow };
