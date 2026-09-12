import { supabase } from '@/lib/supabase';
import type { TareaStatus } from '@/lib/status/tareaStatus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentUpdateSnapshot {
  /** support.equipment_updates.id */
  task_id: string;
  /** public.equipment.id — used to fetch prior resolved updates for rollback. */
  equipment_id: string | null;
  mdb_storage_path: string;
  keys_to_activate: string[];
  keys_to_disable: string[];
}

export interface AssignedTicket {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress';
  // Known categories keep autocomplete; `(string & {})` admits values added by a
  // later migration without widening the union to plain `string`.
  category:
    | 'install_equipment'
    | 'replace_equipment'
    | 'update_equipment'
    | 'maintain_equipment'
    | (string & {});
  opened_at: string;
  building: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    administration: { id: string; company_name: string; address?: string | null };
  };
  /** The equipment this ticket targets, when it has one (maintain_equipment, replace_equipment, etc.). */
  equipment_id?: string | null;
  /** Only present when category === 'update_equipment'. */
  equipmentUpdateSnapshot?: EquipmentUpdateSnapshot | null;
  /**
   * Two-step configure flow (install_equipment, replace_equipment).
   * pending_new_serial null while the installer/admin has not loaded the
   * serial yet; once set, the ticket is ready to be resolved via the standard
   * "Finalizar tarea" flow.
   */
  pending_new_serial: string | null;
  pending_new_model: string | null;
  /** products.name of the linked technical_order_item — model placeholder. */
  intended_product_name: string | null;
}

/**
 * Superset of AssignedTicket used by the task detail. Unlike the worklist it
 * admits closed tickets (resolved / cancelled) and carries the closing
 * metadata the installer sees in read-only mode.
 */
export type TicketDetail = Omit<AssignedTicket, 'status'> & {
  status: TareaStatus;
  updated_at: string;
  resolved_at: string | null;
  resolved_by_staff_id: string | null;
  resolution_notes: string | null;
  cancellation_reason: string | null;
};

/** Flat row shape returned by support.installer_tickets_with_context. */
export interface InstallerTicketViewRow {
  id: string;
  description: string;
  status: string;
  category: string;
  opened_at: string;
  building_id: string | null;
  building_name: string | null;
  building_address: string | null;
  building_city: string | null;
  building_administration_id: string | null;
  administration_company_name: string | null;
  administration_address: string | null;
  pending_new_serial: string | null;
  pending_new_model: string | null;
  technical_order_item_id: string | null;
  equipment_id: string | null;
}

/** Columns every installer ticket query selects from the context view. */
export const INSTALLER_TICKET_VIEW_COLUMNS = `
      id,
      description,
      status,
      category,
      opened_at,
      building_id,
      building_name,
      building_address,
      building_city,
      building_administration_id,
      administration_company_name,
      administration_address,
      pending_new_serial,
      pending_new_model,
      technical_order_item_id,
      equipment_id
    `;

// ---------------------------------------------------------------------------
// Enrichment — category-specific side data that cannot live in the view
// without over-fetching for the common case.
// ---------------------------------------------------------------------------

/**
 * Batch-fetch update_equipment snapshots for the given ticket ids.
 * RLS ensures the installer can only see snapshots for their own assigned tickets.
 */
async function fetchEquipmentUpdateSnapshots(
  ticketIds: string[],
): Promise<Map<string, EquipmentUpdateSnapshot>> {
  const snapshotMap = new Map<string, EquipmentUpdateSnapshot>();
  if (ticketIds.length === 0) return snapshotMap;

  const { data: snapshots } = await supabase
    .schema('support')
    .from('equipment_updates')
    .select('id, ticket_id, equipment_id, mdb_storage_path, keys_to_activate, keys_to_disable')
    .in('ticket_id', ticketIds);
  for (const s of snapshots ?? []) {
    const snap = s as unknown as {
      id: string;
      ticket_id: string;
      equipment_id: string | null;
      mdb_storage_path: string;
      keys_to_activate: string[];
      keys_to_disable: string[];
    };
    snapshotMap.set(snap.ticket_id, {
      task_id: snap.id,
      equipment_id: snap.equipment_id ?? null,
      mdb_storage_path: snap.mdb_storage_path,
      keys_to_activate: snap.keys_to_activate,
      keys_to_disable: snap.keys_to_disable,
    });
  }
  return snapshotMap;
}

/**
 * Batch-fetch product names for the given technical_order_item ids — used as
 * the model placeholder when the operator leaves it blank.
 */
async function fetchProductNamesByTechnicalOrderItem(
  toiIds: string[],
): Promise<Map<string, string>> {
  const productNameByToiId = new Map<string, string>();
  if (toiIds.length === 0) return productNameByToiId;

  const { data: items } = await supabase
    .from('technical_order_items')
    .select('id, product_id')
    .in('id', toiIds);
  const productIds = [
    ...new Set((items ?? []).map((i) => i.product_id).filter((v): v is string => Boolean(v))),
  ];
  const productNameById = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds);
    for (const p of products ?? []) productNameById.set(p.id, p.name);
  }
  for (const i of items ?? []) {
    if (i.product_id) {
      const name = productNameById.get(i.product_id);
      if (name) productNameByToiId.set(i.id, name);
    }
  }
  return productNameByToiId;
}

function mapBuilding(r: InstallerTicketViewRow): AssignedTicket['building'] {
  if (!r.building_id) {
    return {
      id: '',
      name: '',
      address: null,
      city: null,
      administration: { id: '', company_name: '', address: null },
    };
  }
  return {
    id: r.building_id,
    name: r.building_name ?? '',
    address: r.building_address,
    city: r.building_city,
    administration: r.building_administration_id
      ? {
          id: r.building_administration_id,
          company_name: r.administration_company_name ?? '',
          address: r.administration_address,
        }
      : { id: '', company_name: '', address: null },
  };
}

/**
 * Turns flat view rows into AssignedTicket objects, hydrating the
 * category-specific side data (equipment_update snapshot, intended product
 * name) with batched lookups. Shared by the worklist and the single-ticket
 * detail so the two can never diverge.
 */
export async function mapInstallerTicketRows(
  rows: InstallerTicketViewRow[],
): Promise<AssignedTicket[]> {
  const equipmentUpdateTicketIds = rows
    .filter((r) => r.category === 'update_equipment')
    .map((r) => r.id);
  const toiIds = [
    ...new Set(rows.map((r) => r.technical_order_item_id).filter((v): v is string => Boolean(v))),
  ];

  const [snapshotMap, productNameByToiId] = await Promise.all([
    fetchEquipmentUpdateSnapshots(equipmentUpdateTicketIds),
    fetchProductNamesByTechnicalOrderItem(toiIds),
  ]);

  return rows.map((r) => ({
    id: r.id,
    // title maps to description (no separate title column in DB)
    title: r.description,
    description: r.description,
    status: r.status as 'open' | 'in_progress',
    category: r.category,
    opened_at: r.opened_at,
    building: mapBuilding(r),
    equipment_id: r.equipment_id,
    equipmentUpdateSnapshot:
      r.category === 'update_equipment' ? (snapshotMap.get(r.id) ?? null) : undefined,
    pending_new_serial: r.pending_new_serial,
    pending_new_model: r.pending_new_model,
    intended_product_name: r.technical_order_item_id
      ? (productNameByToiId.get(r.technical_order_item_id) ?? null)
      : null,
  }));
}
