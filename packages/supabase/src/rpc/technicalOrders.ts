import type { TypedSupabaseClient } from '../client';
import type { Database, Json } from '../database.types';

type TechnicalOrderRow = Database['public']['Tables']['technical_orders']['Row'];
type TechnicalOrderItemRow = Database['public']['Tables']['technical_order_items']['Row'];

export type TechnicalOrderClientType = 'administration' | 'particular';

export interface TechnicalOrderPayload {
  client_type: TechnicalOrderClientType;
  administration_id?: string | null;
  particular_id?: string | null;
  particular_full_name?: string | null;
  particular_dni?: string | null;
  particular_phone?: string | null;
  particular_email?: string | null;
  notes?: string | null;
}

export type TechnicalOrderItemType =
  | 'install_equipment'
  | 'replace_equipment'
  | 'maintain_equipment';

export interface TechnicalOrderItemPayload {
  item_type: TechnicalOrderItemType;
  quantity: number;
  description?: string | null;
  building_id: string;
  unit_price: number;
  product_id?: string | null;
  intended_equipment_id?: string | null;
  intended_replacement_equipment_id?: string | null;
  intended_assignee_staff_id?: string | null;
}

export interface TechnicalOrderItemUpdatePayload extends TechnicalOrderItemPayload {
  id?: string;
}

export interface UpdateDraftTechnicalOrderInput {
  orderId: string;
  /** Optimistic-concurrency token — must equal technical_orders.updated_at at the DB. */
  expectedUpdatedAt: string;
  patch: Partial<TechnicalOrderPayload>;
  items: TechnicalOrderItemUpdatePayload[];
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
// RPC wrappers — technical orders context
// ────────────────────────────────────────────────────────────────────────────

export function createTechnicalOrderWithItems(
  client: TypedSupabaseClient,
  input: {
    order: TechnicalOrderPayload;
    items: TechnicalOrderItemPayload[];
    confirmImmediately?: boolean;
  },
): Promise<string> {
  return unwrap(
    client.rpc('create_technical_order_with_items', {
      p_order: input.order as unknown as Json,
      p_items: input.items as unknown as Json[],
      p_confirm_immediately: input.confirmImmediately ?? true,
    }),
  );
}

export async function confirmTechnicalOrder(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('confirm_technical_order', { p_order_id: orderId });
  if (error) throw error;
}

export async function cancelTechnicalOrder(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('cancel_technical_order', { p_order_id: orderId });
  if (error) throw error;
}

export function updateDraftTechnicalOrderWithItems(
  client: TypedSupabaseClient,
  input: UpdateDraftTechnicalOrderInput,
): Promise<string> {
  return unwrap(
    client.rpc('update_draft_technical_order_with_items', {
      p_order_id: input.orderId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_patch: input.patch as unknown as Json,
      p_items: input.items as unknown as Json[],
    }),
  );
}

export async function markTechnicalOrderInvoiced(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('mark_technical_order_invoiced', { p_order_id: orderId });
  if (error) throw error;
}

export async function recomputeTechnicalOrderStatus(
  client: TypedSupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc('recompute_technical_order_status', {
    p_order_id: orderId,
  });
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────────────────
// Direct-table helpers for technical_orders and technical_order_items
// ────────────────────────────────────────────────────────────────────────────

export type { TechnicalOrderRow, TechnicalOrderItemRow };
