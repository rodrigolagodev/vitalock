import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ordenKey } from '@/lib/queryKeys';

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: 'key' | 'equipment' | 'maintenance' | 'installation';
  quantity: number;
  description: string | null;
  status: 'pending' | 'configured' | 'in_progress' | 'completed' | 'cancelled';
  building_id: string | null;
  produced_key_id: string | null;
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

export interface OrdenDetailRow {
  id: string;
  order_number: string;
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
  status: 'draft' | 'in_preparation' | 'ready_for_pickup' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  order_items: OrderItemRow[];
}

export function useOrden(id: string | undefined) {
  return useQuery({
    queryKey: ordenKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<OrdenDetailRow | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('orders')
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
          order_items (
            id,
            order_id,
            item_type,
            quantity,
            description,
            status,
            building_id,
            produced_key_id,
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
      return data as unknown as OrdenDetailRow;
    },
  });
}
