import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ordenKey } from '@/lib/queryKeys';

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: 'key' | 'equipment' | 'maintenance' | 'installation' | 'equipment_replacement';
  quantity: number;
  description: string | null;
  status: 'pending' | 'configured' | 'in_progress' | 'completed' | 'cancelled';
  building_id: string | null;
  /** Preselected unit at order creation (nullable — optional at create time). */
  unit_id: string | null;
  /** Per-item price captured at order creation — needed for draft edit hydration. */
  unit_price: number | null;
  /** Key product reference (rfid_key category) — needed for draft edit hydration. */
  product_id: string | null;
  produced_key_id: string | null;
  /** Item-level authorized retirer id (particulares.id) — new pickup model. */
  pickup_particular_id: string | null;
  /** Item-level authorized retirer resolved via embed (display + prefill). */
  pickup_particulares: {
    id: string;
    full_name: string;
    dni: string;
  } | null;
  /** Produced key pickup state (null when the item has no key yet). */
  rfid_keys: {
    picked_up_at: string | null;
    picked_up_by_name: string | null;
    picked_up_by_surname: string | null;
    picked_up_by_dni: string | null;
    delivered_by_staff_id: string | null;
  } | null;
}

export interface ParticularRef {
  id: string;
  unit_id: string;
  dni: string;
  full_name: string;
  phone: string | null;
  email: string | null;
}

export type OrderType = 'keys' | 'technical';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'ready_for_pickup'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

export interface OrdenDetailRow {
  id: string;
  order_number: string;
  order_type: OrderType;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_id: string | null;
  pickup_particular_id: string | null;
  particulares: ParticularRef | null;
  particular_full_name: string | null;
  particular_dni: string | null;
  particular_phone: string | null;
  particular_email: string | null;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  /** Last modification timestamp — used for optimistic concurrency in draft edits. */
  updated_at: string;
  order_items: OrderItemRow[];
}

const KEY_ORDER_DETAIL_SELECT = `
  id,
  order_number,
  client_type,
  administration_id,
  administrations ( company_name ),
  particular_id,
  pickup_particular_id,
  particulares!particular_id (
    id,
    unit_id,
    dni,
    full_name,
    phone,
    email
  ),
  particular_full_name,
  particular_dni,
  particular_phone,
  particular_email,
  status,
  notes,
  created_at,
  updated_at,
  key_order_items (
    id,
    order_id,
    item_type,
    quantity,
    description,
    status,
    building_id,
    unit_id,
    unit_price,
    product_id,
    produced_key_id,
    pickup_particular_id,
    pickup_particulares:particulares!pickup_particular_id (
      id,
      full_name,
      dni
    ),
    rfid_keys!produced_key_id (
      picked_up_at,
      picked_up_by_name,
      picked_up_by_surname,
      picked_up_by_dni,
      delivered_by_staff_id
    )
  )
`;

const TECHNICAL_ORDER_DETAIL_SELECT = `
  id,
  order_number,
  client_type,
  administration_id,
  administrations ( company_name ),
  particular_id,
  particulares!particular_id (
    id,
    unit_id,
    dni,
    full_name,
    phone,
    email
  ),
  particular_full_name,
  particular_dni,
  particular_phone,
  particular_email,
  status,
  notes,
  created_at,
  updated_at,
  technical_order_items (
    id,
    order_id,
    item_type,
    quantity,
    description,
    status,
    building_id,
    unit_id,
    unit_price,
    product_id
  )
`;

export function useOrden(id: string | undefined) {
  return useQuery({
    queryKey: ordenKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<OrdenDetailRow | null> => {
      if (!id) return null;

      // Phase 1: Determine order_kind via the all_orders VIEW.
      const { data: kindRow, error: kindError } = await supabase
        .from('all_orders')
        .select('order_kind')
        .eq('id', id)
        .single();

      if (kindError) throw kindError;
      if (!kindRow) return null;

      const orderKind = (kindRow as unknown as { order_kind: string }).order_kind;

      if (orderKind === 'key') {
        // Phase 2a: Fetch from key_orders with items.
        const { data, error } = await supabase
          .from('key_orders')
          .select(KEY_ORDER_DETAIL_SELECT)
          .eq('id', id)
          .single();

        if (error) throw error;
        if (!data) return null;

        const row = data as unknown as OrdenDetailRow & { key_order_items?: OrderItemRow[] };
        return {
          ...row,
          order_type: 'keys' as OrderType,
          // Remap key_order_items → order_items for backward compat.
          order_items: (row.key_order_items ?? []).map((item) => ({
            ...item,
            order_id: item.order_id ?? id,
          })),
        };
      } else {
        // Phase 2b: Fetch from technical_orders with items.
        const { data, error } = await supabase
          .from('technical_orders')
          .select(TECHNICAL_ORDER_DETAIL_SELECT)
          .eq('id', id)
          .single();

        if (error) throw error;
        if (!data) return null;

        const row = data as unknown as OrdenDetailRow & { technical_order_items?: OrderItemRow[] };
        return {
          ...row,
          order_type: 'technical' as OrderType,
          pickup_particular_id: null, // technical orders have no pickup semantics
          // Remap technical_order_items → order_items for backward compat.
          order_items: (row.technical_order_items ?? []).map((item) => ({
            ...item,
            order_id: item.order_id ?? id,
            produced_key_id: null,
            pickup_particular_id: null,
            pickup_particulares: null,
            rfid_keys: null,
          })),
        };
      }
    },
  });
}
