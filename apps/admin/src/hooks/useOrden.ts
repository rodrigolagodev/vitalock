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
}

export interface OrdenDetailRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
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
            produced_key_id
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as OrdenDetailRow;
    },
  });
}
