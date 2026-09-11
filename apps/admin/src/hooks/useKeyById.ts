import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { KeyStatus } from '@/lib/status/keyStatus';
import { keyDetailKey } from '@/lib/queryKeys';

interface KeyDetailAuthorizedEquipment {
  authorization_id: string;
  equipment_id: string;
  serial_number: string;
  model: string | null;
  building_id: string;
}

interface KeyDetailAssociatedOrder {
  key_order_id: string;
  order_number: string;
  order_status: string;
  order_created_at: string;
  /** Item status inside the order (pending | configured | installed | cancelled). */
  item_status: string;
  /** When the item was added (created_at of the key_order_items row). */
  item_created_at: string | null;
}

export interface KeyDetail {
  id: string;
  rfid_code: string;
  status: KeyStatus;
  notes: string | null;
  activated_at: string;
  deactivated_at: string | null;
  picked_up_at: string | null;
  picked_up_by_name: string | null;
  picked_up_by_surname: string | null;
  picked_up_by_dni: string | null;
  delivered_by: { id: string; full_name: string } | null;
  unit: {
    id: string;
    number: string;
    unit_type: string | null;
    is_administrative: boolean;
    status: string;
    building: {
      id: string;
      name: string;
      administration: { id: string; company_name: string } | null;
    } | null;
  };
  authorized_equipment: KeyDetailAuthorizedEquipment[];
  associated_orders: KeyDetailAssociatedOrder[];
}

// Embedded selects below (`units!unit_id (…)`, `equipment:equipment_id (…)`,
// `key_orders!order_id (…)`) are to-one relations. postgrest-js 2.45 infers
// them as arrays (and errors on the cross-schema alias), while PostgREST
// returns objects at runtime. Instead of casting to the shape we believe in,
// the payload is validated at the boundary: a mismatch surfaces as a thrown
// ZodError at the call site, not as `undefined` several renders later.
const RawKeySchema = z.object({
  id: z.string(),
  rfid_code: z.string(),
  status: z.string(),
  notes: z.string().nullable(),
  activated_at: z.string(),
  deactivated_at: z.string().nullable(),
  picked_up_at: z.string().nullable(),
  picked_up_by_name: z.string().nullable(),
  picked_up_by_surname: z.string().nullable(),
  picked_up_by_dni: z.string().nullable(),
  delivered_by_staff_id: z.string().nullable(),
  units: z
    .object({
      id: z.string(),
      number: z.string(),
      unit_type: z.string().nullable(),
      is_administrative: z.boolean(),
      status: z.string(),
      buildings: z
        .object({
          id: z.string(),
          name: z.string(),
          administrations: z.object({ id: z.string(), company_name: z.string() }).nullable(),
        })
        .nullable(),
    })
    .nullable(),
});

const RawAuthSchema = z.object({
  id: z.string(),
  equipment: z
    .object({
      id: z.string(),
      serial_number: z.string(),
      model: z.string().nullable(),
      building_id: z.string(),
    })
    .nullable(),
});

const RawOrderItemSchema = z.object({
  status: z.string(),
  created_at: z.string().nullable(),
  key_orders: z
    .object({
      id: z.string(),
      order_number: z.string(),
      status: z.string(),
      created_at: z.string(),
    })
    .nullable(),
});

/**
 * Rich, audit-oriented detail for a single RFID key. Aggregates:
 *  - unit + building + administration (location chain)
 *  - authorized equipment (what the key opens)
 *  - orders that produced or touched this key
 *  - the staff member who delivered it (if any)
 *
 * Queries run in parallel; failures short-circuit via the standard react-query
 * error path. The four sources live in three schemas (public, operations,
 * identity) so cross-schema embeds are avoided.
 */
export function useKeyById(keyId: string | null | undefined) {
  return useQuery({
    queryKey: keyDetailKey(keyId ?? undefined),
    enabled: Boolean(keyId),
    queryFn: async (): Promise<KeyDetail | null> => {
      const id = keyId as string;

      const [keyRes, authRes, orderItemsRes] = await Promise.all([
        supabase
          .from('rfid_keys')
          .select(
            `id, rfid_code, status, notes, activated_at, deactivated_at,
             picked_up_at, picked_up_by_name, picked_up_by_surname, picked_up_by_dni,
             delivered_by_staff_id,
             units!unit_id (
               id, number, unit_type, is_administrative, status,
               buildings!building_id (
                 id, name,
                 administrations!administration_id ( id, company_name )
               )
             )`,
          )
          .eq('id', id)
          .maybeSingle(),
        supabase
          .schema('operations')
          .from('key_authorizations')
          .select(`id, equipment:equipment_id ( id, serial_number, model, building_id )`)
          .eq('rfid_key_id', id),
        supabase
          .from('key_order_items')
          .select(
            `status, created_at,
             key_orders!order_id ( id, order_number, status, created_at )`,
          )
          .eq('produced_key_id', id),
      ]);

      if (keyRes.error) throw keyRes.error;
      if (!keyRes.data) return null;
      if (authRes.error) throw authRes.error;
      if (orderItemsRes.error) throw orderItemsRes.error;

      const raw = RawKeySchema.parse(keyRes.data);
      if (!raw.units) return null;

      const auths = z.array(RawAuthSchema).parse(authRes.data ?? []);
      const orderItems = z.array(RawOrderItemSchema).parse(orderItemsRes.data ?? []);

      let deliveredBy: KeyDetail['delivered_by'] = null;
      if (raw.delivered_by_staff_id) {
        const { data: staffRow, error: staffErr } = await supabase
          .schema('identity')
          .from('staff')
          .select('id, full_name')
          .eq('id', raw.delivered_by_staff_id)
          .maybeSingle();
        if (staffErr) throw staffErr;
        deliveredBy = staffRow ? { id: staffRow.id, full_name: staffRow.full_name } : null;
      }

      const authorizedEquipment: KeyDetailAuthorizedEquipment[] = auths
        .filter((a) => a.equipment !== null)
        .map((a) => ({
          authorization_id: a.id,
          equipment_id: a.equipment!.id,
          serial_number: a.equipment!.serial_number,
          model: a.equipment!.model,
          building_id: a.equipment!.building_id,
        }));

      const associatedOrders: KeyDetailAssociatedOrder[] = orderItems
        .filter((i) => i.key_orders !== null)
        .map((i) => ({
          key_order_id: i.key_orders!.id,
          order_number: i.key_orders!.order_number,
          order_status: i.key_orders!.status,
          order_created_at: i.key_orders!.created_at,
          item_status: i.status,
          item_created_at: i.created_at,
        }))
        .sort((a, b) => b.order_created_at.localeCompare(a.order_created_at));

      const buildings = raw.units.buildings;

      return {
        id: raw.id,
        rfid_code: raw.rfid_code,
        status: raw.status as KeyStatus,
        notes: raw.notes,
        activated_at: raw.activated_at,
        deactivated_at: raw.deactivated_at,
        picked_up_at: raw.picked_up_at,
        picked_up_by_name: raw.picked_up_by_name,
        picked_up_by_surname: raw.picked_up_by_surname,
        picked_up_by_dni: raw.picked_up_by_dni,
        delivered_by: deliveredBy,
        unit: {
          id: raw.units.id,
          number: raw.units.number,
          unit_type: raw.units.unit_type,
          is_administrative: raw.units.is_administrative,
          status: raw.units.status,
          building: buildings
            ? {
                id: buildings.id,
                name: buildings.name,
                administration: buildings.administrations
                  ? {
                      id: buildings.administrations.id,
                      company_name: buildings.administrations.company_name,
                    }
                  : null,
              }
            : null,
        },
        authorized_equipment: authorizedEquipment,
        associated_orders: associatedOrders,
      };
    },
  });
}
