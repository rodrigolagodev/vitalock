import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EquipmentStatus } from '@/lib/status/equipmentStatus';

type AuthorizationSyncState = 'pending_install' | 'installed' | 'pending_removal' | 'removed';

export interface EquipmentDetailAuthorizedKey {
  authorization_id: string;
  sync_state: AuthorizationSyncState;
  installed_at: string | null;
  removed_at: string | null;
  key_id: string;
  rfid_code: string;
  key_status: string;
  unit_number: string | null;
}

interface EquipmentDetailReplacementLink {
  id: string;
  serial_number: string;
  model: string | null;
}

export interface EquipmentDetailAssociatedOrder {
  technical_order_id: string;
  order_number: string;
  order_status: string;
  order_created_at: string;
  item_status: string;
  item_type: string;
  /** 'target' when this equipment is the item's intended equipment; 'replacement' when it's the replacement device. */
  role: 'target' | 'replacement';
}

export interface EquipmentDetail {
  id: string;
  serial_number: string;
  model: string | null;
  description: string;
  access_type: string | null;
  status: EquipmentStatus;
  installed_at: string;
  decommissioned_at: string | null;
  decommission_reason: string | null;
  notes: string | null;
  building: {
    id: string;
    name: string;
    administration: { id: string; company_name: string } | null;
  } | null;
  replaces: EquipmentDetailReplacementLink | null;
  replaced_by: EquipmentDetailReplacementLink | null;
  authorized_keys: EquipmentDetailAuthorizedKey[];
  associated_orders: EquipmentDetailAssociatedOrder[];
}

interface RawEquipment {
  id: string;
  serial_number: string;
  model: string | null;
  description: string;
  access_type: string | null;
  status: string;
  replaces_equipment_id: string | null;
  installed_at: string;
  decommissioned_at: string | null;
  decommission_reason: string | null;
  notes: string | null;
  building_id: string;
}

interface RawAuth {
  id: string;
  sync_state: string;
  installed_at: string | null;
  removed_at: string | null;
  rfid_key_id: string;
}

interface RawKey {
  id: string;
  rfid_code: string;
  status: string;
  unit_id: string;
}

interface RawUnit {
  id: string;
  number: string;
}

interface RawOrderItem {
  order_id: string;
  item_type: string;
  status: string;
  intended_equipment_id: string | null;
  intended_replacement_equipment_id: string | null;
}

interface RawTechnicalOrder {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
}

interface RawBuilding {
  id: string;
  name: string;
  administration_id: string;
}

interface RawAdministration {
  id: string;
  company_name: string;
}

interface RawReplacementRef {
  id: string;
  serial_number: string;
  model: string | null;
}

/**
 * Rich, audit-oriented detail for a single physical equipment. Aggregates:
 *  - building + administration (location chain)
 *  - authorized keys (what this equipment opens for)
 *  - replacement chain (previous device + successor if any)
 *  - technical orders that touched this equipment
 *
 * Uses only same-schema selects to keep PostgREST cross-schema embeds out
 * of the picture — joins are stitched in JS.
 */
export function useEquipmentById(equipmentId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'equipment-detail', equipmentId ?? 'none'],
    enabled: Boolean(equipmentId),
    queryFn: async (): Promise<EquipmentDetail | null> => {
      const id = equipmentId as string;

      // Round 1: equipment + independent-lookup queries (no dependency on equipment fields).
      const [equipmentRes, authsRes, successorRes, targetItemsRes, replacementItemsRes] =
        await Promise.all([
          supabase
            .schema('operations')
            .from('equipment')
            .select(
              `id, serial_number, model, description, access_type, status,
             replaces_equipment_id, installed_at, decommissioned_at,
             decommission_reason, notes, building_id`,
            )
            .eq('id', id)
            .maybeSingle(),
          supabase
            .schema('operations')
            .from('key_authorizations')
            .select('id, sync_state, installed_at, removed_at, rfid_key_id')
            .eq('equipment_id', id),
          supabase
            .schema('operations')
            .from('equipment')
            .select('id, serial_number, model')
            .eq('replaces_equipment_id', id)
            .maybeSingle(),
          supabase
            .from('technical_order_items')
            .select(
              'order_id, item_type, status, intended_equipment_id, intended_replacement_equipment_id',
            )
            .eq('intended_equipment_id', id),
          supabase
            .from('technical_order_items')
            .select(
              'order_id, item_type, status, intended_equipment_id, intended_replacement_equipment_id',
            )
            .eq('intended_replacement_equipment_id', id),
        ]);

      if (equipmentRes.error) throw equipmentRes.error;
      if (!equipmentRes.data) return null;
      if (authsRes.error) throw authsRes.error;
      if (successorRes.error) throw successorRes.error;
      if (targetItemsRes.error) throw targetItemsRes.error;
      if (replacementItemsRes.error) throw replacementItemsRes.error;

      const raw = equipmentRes.data as unknown as RawEquipment;
      const auths = (authsRes.data ?? []) as unknown as RawAuth[];
      const targetItems = (targetItemsRes.data ?? []) as unknown as RawOrderItem[];
      const replacementItems = (replacementItemsRes.data ?? []) as unknown as RawOrderItem[];

      // Round 2: dependent lookups (need ids gathered from round 1).
      const keyIds = auths.map((a) => a.rfid_key_id);
      const orderIds = Array.from(
        new Set([...targetItems, ...replacementItems].map((i) => i.order_id)),
      );

      const [buildingRes, predecessorRes, keysRes, ordersRes] = await Promise.all([
        supabase
          .from('buildings')
          .select('id, name, administration_id')
          .eq('id', raw.building_id)
          .maybeSingle(),
        raw.replaces_equipment_id
          ? supabase
              .schema('operations')
              .from('equipment')
              .select('id, serial_number, model')
              .eq('id', raw.replaces_equipment_id)
              .maybeSingle()
          : Promise.resolve({ data: null as RawReplacementRef | null, error: null }),
        keyIds.length > 0
          ? supabase.from('rfid_keys').select('id, rfid_code, status, unit_id').in('id', keyIds)
          : Promise.resolve({ data: [] as RawKey[], error: null }),
        orderIds.length > 0
          ? supabase
              .from('technical_orders')
              .select('id, order_number, status, created_at')
              .in('id', orderIds)
          : Promise.resolve({ data: [] as RawTechnicalOrder[], error: null }),
      ]);

      if (buildingRes.error) throw buildingRes.error;
      if (predecessorRes.error) throw predecessorRes.error;
      if (keysRes.error) throw keysRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const rawBuilding = buildingRes.data as unknown as RawBuilding | null;
      const keys = (keysRes.data ?? []) as unknown as RawKey[];
      const orders = (ordersRes.data ?? []) as unknown as RawTechnicalOrder[];

      // Round 3: admin + units (last dependency chain).
      const unitIds = Array.from(new Set(keys.map((k) => k.unit_id)));

      const [adminRes, unitsRes] = await Promise.all([
        rawBuilding
          ? supabase
              .from('administrations')
              .select('id, company_name')
              .eq('id', rawBuilding.administration_id)
              .maybeSingle()
          : Promise.resolve({ data: null as RawAdministration | null, error: null }),
        unitIds.length > 0
          ? supabase.from('units').select('id, number').in('id', unitIds)
          : Promise.resolve({ data: [] as RawUnit[], error: null }),
      ]);

      if (adminRes.error) throw adminRes.error;
      if (unitsRes.error) throw unitsRes.error;

      const admin = adminRes.data as unknown as RawAdministration | null;
      const units = (unitsRes.data ?? []) as unknown as RawUnit[];

      // Stitch everything together in memory.
      const keyById = new Map(keys.map((k) => [k.id, k]));
      const unitById = new Map(units.map((u) => [u.id, u]));
      const orderById = new Map(orders.map((o) => [o.id, o]));

      const authorizedKeys: EquipmentDetailAuthorizedKey[] = auths
        .map((a) => {
          const key = keyById.get(a.rfid_key_id);
          if (!key) return null;
          const unit = unitById.get(key.unit_id);
          return {
            authorization_id: a.id,
            sync_state: a.sync_state as AuthorizationSyncState,
            installed_at: a.installed_at,
            removed_at: a.removed_at,
            key_id: key.id,
            rfid_code: key.rfid_code,
            key_status: key.status,
            unit_number: unit?.number ?? null,
          };
        })
        .filter((k): k is EquipmentDetailAuthorizedKey => k !== null);

      const associatedOrders: EquipmentDetailAssociatedOrder[] = [
        ...targetItems.map((i) => ({ item: i, role: 'target' as const })),
        ...replacementItems.map((i) => ({ item: i, role: 'replacement' as const })),
      ]
        .map(({ item, role }) => {
          const order = orderById.get(item.order_id);
          if (!order) return null;
          return {
            technical_order_id: order.id,
            order_number: order.order_number,
            order_status: order.status,
            order_created_at: order.created_at,
            item_status: item.status,
            item_type: item.item_type,
            role,
          } satisfies EquipmentDetailAssociatedOrder;
        })
        .filter((o): o is EquipmentDetailAssociatedOrder => o !== null)
        .sort((a, b) => b.order_created_at.localeCompare(a.order_created_at));

      return {
        id: raw.id,
        serial_number: raw.serial_number,
        model: raw.model,
        description: raw.description,
        access_type: raw.access_type,
        status: raw.status as EquipmentStatus,
        installed_at: raw.installed_at,
        decommissioned_at: raw.decommissioned_at,
        decommission_reason: raw.decommission_reason,
        notes: raw.notes,
        building: rawBuilding
          ? {
              id: rawBuilding.id,
              name: rawBuilding.name,
              administration: admin ? { id: admin.id, company_name: admin.company_name } : null,
            }
          : null,
        replaces: predecessorRes.data ? (predecessorRes.data as RawReplacementRef) : null,
        replaced_by: successorRes.data ? (successorRes.data as RawReplacementRef) : null,
        authorized_keys: authorizedKeys,
        associated_orders: associatedOrders,
      };
    },
  });
}
