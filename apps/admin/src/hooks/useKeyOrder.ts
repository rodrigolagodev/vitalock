import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keyOrderKey } from '@/lib/queryKeys';

export interface KeyOrderItemRow {
  id: string;
  order_id: string;
  item_type: 'key';
  quantity: number;
  description: string | null;
  status: 'pending' | 'configured' | 'cancelled';
  building_id: string;
  unit_id: string | null;
  unit_price: number | null;
  product_id: string | null;
  produced_key_id: string | null;
  pickup_particular_id: string | null;
  pickup_particulares: {
    id: string;
    full_name: string;
    dni: string;
  } | null;
  rfid_keys: {
    picked_up_at: string | null;
    picked_up_by_name: string | null;
    picked_up_by_surname: string | null;
    picked_up_by_dni: string | null;
    delivered_by_staff_id: string | null;
  } | null;
}

export interface KeyOrderDetailRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_id: string | null;
  pickup_particular_id: string | null;
  particulares: {
    id: string;
    unit_id: string;
    dni: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  particular_full_name: string | null;
  particular_dni: string | null;
  particular_phone: string | null;
  particular_email: string | null;
  status:
    | 'draft'
    | 'confirmed'
    | 'in_progress'
    | 'ready_for_pickup'
    | 'completed'
    | 'invoiced'
    | 'cancelled';
  notes: string | null;
  created_at: string;
  /** Last modification timestamp — used for optimistic concurrency in draft edits. */
  updated_at: string;
  key_order_items: KeyOrderItemRow[];
}

export function useKeyOrder(id: string | undefined) {
  return useQuery({
    queryKey: keyOrderKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<KeyOrderDetailRow | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('key_orders')
        .select(`
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
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as KeyOrderDetailRow;
    },
  });
}
