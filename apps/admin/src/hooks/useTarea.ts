import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TareaRow } from './useTareas';

interface AssignedEquipment {
  id: string;
  serial_number: string;
  model: string | null;
  status: string;
  access_type: string;
  building_id: string;
}

export type TareaDetailRow = TareaRow & {
  equipment: AssignedEquipment | null;
  /** Serial the operator loaded via configure_technical_ticket_equipment. */
  pending_new_serial: string | null;
  /** Model to use for the new equipment; may fall back to the linked product. */
  pending_new_model: string | null;
  /** FK to the driving technical_order_item (null for freestanding tickets). */
  technical_order_item_id: string | null;
  /** products.name of the linked item's product — used as the model placeholder. */
  intended_product_name: string | null;
};

export function useTarea(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'tarea', id ?? ''],
    enabled: Boolean(id),
    queryFn: async (): Promise<TareaDetailRow | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .select(
          `id, ticket_number, category, description, status,
           administration_id, building_id, unit_id, equipment_id,
           assigned_to_staff_id, opened_by_staff_id,
           opened_at, updated_at,
           resolution_notes, cancellation_reason, notes,
           pending_new_serial, pending_new_model,
           technical_order_item_id`,
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as TareaRow & {
        pending_new_serial: string | null;
        pending_new_model: string | null;
        technical_order_item_id: string | null;
      };

      // Resolve building + administration + staff names in a couple of extra
      // round-trips (same reason as useTareas: no cross-schema embed).
      let building: TareaRow['building'] = null;
      if (row.building_id) {
        const { data: b } = await supabase
          .from('buildings')
          .select('id, name, administration_id')
          .eq('id', row.building_id)
          .single();
        if (b) {
          let admin: { id: string; company_name: string } | null = null;
          if (b.administration_id) {
            const { data: a } = await supabase
              .from('administrations')
              .select('id, company_name')
              .eq('id', b.administration_id)
              .single();
            if (a) admin = a;
          }
          building = { id: b.id, name: b.name, administration: admin };
        }
      }

      const staffIds = [row.assigned_to_staff_id, row.opened_by_staff_id].filter((v): v is string =>
        Boolean(v),
      );
      const staffMap = new Map<string, string>();
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .schema('identity')
          .from('staff')
          .select('id, full_name')
          .in('id', staffIds);
        for (const s of staff ?? []) staffMap.set(s.id, s.full_name);
      }

      // Assigned equipment (may be null while the ticket is open).
      let equipment: AssignedEquipment | null = null;
      if (row.equipment_id) {
        const { data: eq } = await supabase
          .schema('operations')
          .from('equipment')
          .select('id, serial_number, model, status, access_type, building_id')
          .eq('id', row.equipment_id)
          .single();
        if (eq) equipment = eq as unknown as AssignedEquipment;
      }

      // Resolve the product name of the driving technical_order_item so the
      // UI can offer it as a placeholder for the model input (matches the
      // RPC's auto-fill behaviour when the operator leaves the field empty).
      let intended_product_name: string | null = null;
      if (row.technical_order_item_id) {
        const { data: item } = await supabase
          .from('technical_order_items')
          .select('product_id')
          .eq('id', row.technical_order_item_id)
          .single();
        if (item?.product_id) {
          const { data: product } = await supabase
            .from('products')
            .select('name')
            .eq('id', item.product_id)
            .single();
          intended_product_name = product?.name ?? null;
        }
      }

      return {
        ...row,
        building,
        assigned_to_name: row.assigned_to_staff_id
          ? (staffMap.get(row.assigned_to_staff_id) ?? null)
          : null,
        opened_by_name: row.opened_by_staff_id
          ? (staffMap.get(row.opened_by_staff_id) ?? null)
          : null,
        equipment,
        intended_product_name,
      };
    },
  });
}
