import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type KeyStatus =
  | 'pending_creation'
  | 'pending_installation'
  | 'active'
  | 'pending_disable'
  | 'disabled';

export interface KeyDetailAuthorizedEquipment {
  authorization_id: string;
  equipment_id: string;
  serial_number: string;
  model: string | null;
  building_id: string;
}

export interface KeyDetailAssociatedOrder {
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

interface RawKey {
  id: string;
  rfid_code: string;
  status: string;
  notes: string | null;
  activated_at: string;
  deactivated_at: string | null;
  picked_up_at: string | null;
  picked_up_by_name: string | null;
  picked_up_by_surname: string | null;
  picked_up_by_dni: string | null;
  delivered_by_staff_id: string | null;
  units: {
    id: string;
    number: string;
    unit_type: string | null;
    is_administrative: boolean;
    status: string;
    buildings: {
      id: string;
      name: string;
      administrations: { id: string; company_name: string } | null;
    } | null;
  } | null;
}

interface RawAuth {
  id: string;
  equipment: {
    id: string;
    serial_number: string;
    model: string | null;
    building_id: string;
  } | null;
}

interface RawOrderItem {
  status: string;
  created_at: string | null;
  key_orders: {
    id: string;
    order_number: string;
    status: string;
    created_at: string;
  } | null;
}

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
    queryKey: ['admin', 'key-detail', keyId ?? 'none'],
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
          .select(
            `id, equipment:equipment_id ( id, serial_number, model, building_id )`,
          )
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

      const raw = keyRes.data as unknown as RawKey;
      if (!raw.units) return null;

      const auths = (authRes.data ?? []) as unknown as RawAuth[];
      const orderItems = (orderItemsRes.data ?? []) as unknown as RawOrderItem[];

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
