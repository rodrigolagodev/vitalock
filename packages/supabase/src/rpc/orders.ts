import type { TypedSupabaseClient } from '../client';
import type { Database, Json } from '../database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type OrderUpdate = Database['public']['Tables']['orders']['Update'];

export type OrderType = 'keys' | 'technical';
export type ClientType = 'administration' | 'particular';

export interface OrderPayload {
  order_type: OrderType;
  client_type: ClientType;
  administration_id?: string | null;
  particular_id?: string | null;
  particular_full_name?: string | null;
  particular_dni?: string | null;
  particular_phone?: string | null;
  particular_email?: string | null;
  notes?: string | null;
  status?: 'draft';
}

export type OrderItemType =
  | 'key'
  | 'equipment'
  | 'maintenance'
  | 'installation'
  | 'equipment_replacement';

export interface OrderItemPayload {
  item_type: OrderItemType;
  quantity: number;
  description?: string | null;
  building_id?: string | null;
  equipment_id?: string | null;
  unit_price?: number | null;
  unit_id?: string | null;
  pickup_particular_id?: string | null;
  /** Inventory SKU consumed by this line. Required for key/equipment items. */
  product_id?: string | null;
}

export interface OrderItemUpdatePayload extends OrderItemPayload {
  id?: string;
}

/**
 * Wrap a Supabase Response promise so callers always get either data or a thrown error.
 * The generated RPC types return `{ data, error }` — this collapses that to a single value.
 */
async function unwrap<T>(
  promise: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as T;
}

// ────────────────────────────────────────────────────────────────────────────
// RPC wrappers — the Json cast is centralized here so app code never needs it.
// ────────────────────────────────────────────────────────────────────────────

export function createOrderWithItems(
  client: TypedSupabaseClient,
  input: { order: OrderPayload; items: OrderItemPayload[] },
): Promise<string> {
  return unwrap(
    client.rpc('create_order_with_items', {
      p_order: input.order as unknown as Json,
      p_items: input.items as unknown as Json[],
    }),
  );
}

export async function confirmOrder(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('confirm_order', { p_order_id: orderId });
  if (error) throw error;
}

export function updateDraftOrderWithItems(
  client: TypedSupabaseClient,
  input: {
    orderId: string;
    /** Optimistic-concurrency token — must equal orders.updated_at at the DB. */
    expectedUpdatedAt: string;
    patch: Partial<OrderPayload>;
    items: OrderItemUpdatePayload[];
  },
): Promise<string> {
  return unwrap(
    client.rpc('update_draft_order_with_items', {
      p_order_id: input.orderId,
      p_patch: input.patch as unknown as Json,
      p_items: input.items as unknown as Json[],
      p_expected_updated_at: input.expectedUpdatedAt,
    }),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Direct-table wrappers (not RPCs, but bundled here to keep order writes typed).
// ────────────────────────────────────────────────────────────────────────────

export async function cancelOrder(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const patch: OrderUpdate = { status: 'cancelled' };
  const { error } = await client.from('orders').update(patch).eq('id', orderId);
  if (error) throw error;
}

export async function setOrderPickupPerson(
  client: TypedSupabaseClient,
  input: { orderId: string; pickupParticularId: string | null },
): Promise<void> {
  const patch: OrderUpdate = { pickup_particular_id: input.pickupParticularId };
  const { error } = await client.from('orders').update(patch).eq('id', input.orderId);
  if (error) throw error;
}

export async function markOrderInvoiced(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const patch: OrderUpdate = { status: 'invoiced' };
  const { error } = await client.from('orders').update(patch).eq('id', orderId);
  if (error) throw error;
}

export type { OrderRow };
