import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { technicalOrderKey } from '@/lib/queryKeys';

export interface TechnicalOrderItemRow {
  id: string;
  order_id: string;
  item_type: 'equipment' | 'maintenance' | 'installation' | 'equipment_replacement';
  quantity: number;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  building_id: string;
  unit_price: number | null;
  product_id: string | null;
  intended_equipment_id: string | null;
  intended_assignee_staff_id: string | null;
}

export interface TechnicalOrderDetailRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_id: string | null;
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
    | 'completed'
    | 'invoiced'
    | 'cancelled';
  notes: string | null;
  created_at: string;
  /** Last modification timestamp — used for optimistic concurrency in draft edits. */
  updated_at: string;
  technical_order_items: TechnicalOrderItemRow[];
}

export function useTechnicalOrder(id: string | undefined) {
  return useQuery({
    queryKey: technicalOrderKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<TechnicalOrderDetailRow | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('technical_orders')
        .select(`
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
            unit_price,
            product_id,
            intended_equipment_id,
            intended_assignee_staff_id
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as TechnicalOrderDetailRow;
    },
  });
}
