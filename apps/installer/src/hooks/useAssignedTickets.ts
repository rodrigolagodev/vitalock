import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger, useAuthContext } from '@vitalock/shared';
import { assignedTicketsKey } from '@/lib/queryKeys';

const log = logger('useAssignedTickets');

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
  category: 'maintenance' | 'installation' | 'equipment_installation' | 'equipment_replacement' | 'equipment_update' | string;
  opened_at: string;
  building: {
    id: string;
    name: string;
    administration: { id: string; company_name: string };
  };
  /** Only present when category === 'equipment_update'. */
  equipmentUpdateSnapshot?: EquipmentUpdateSnapshot | null;
  /**
   * Two-step configure flow (equipment_installation, equipment_replacement).
   * pending_new_serial null while the installer/admin has not loaded the
   * serial yet; once set, the ticket is ready to be resolved via the standard
   * "Finalizar tarea" flow.
   */
  pending_new_serial: string | null;
  pending_new_model: string | null;
  /** products.name of the linked technical_order_item — model placeholder. */
  intended_product_name: string | null;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchAssignedTickets(staffId: string): Promise<AssignedTicket[]> {
  // Note: PostgREST cannot embed cross-schema FKs (support -> public), so we
  // fetch flat rows and resolve building + administration names with batch
  // lookups. An embed like building:building_id(...) fails with PGRST200.
  const { data, error } = await supabase
    .schema('support')
    .from('tickets')
    .select(`
      id,
      description,
      status,
      category,
      opened_at,
      building_id,
      pending_new_serial,
      pending_new_model,
      technical_order_item_id,
      equipment_id
    `)
    .eq('assigned_to_staff_id', staffId)
    .in('status', ['open', 'in_progress']);

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    description: string;
    status: string;
    category: string;
    opened_at: string;
    building_id: string | null;
    pending_new_serial: string | null;
    pending_new_model: string | null;
    technical_order_item_id: string | null;
    equipment_id: string | null;
  }[];

  // Batch lookup of building names + their administration.
  const buildingIds = [
    ...new Set(rows.map((r) => r.building_id).filter((v): v is string => Boolean(v))),
  ];
  const buildingMap = new Map<string, { id: string; name: string; administration_id: string | null }>();
  if (buildingIds.length > 0) {
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, name, administration_id')
      .in('id', buildingIds);
    for (const b of buildings ?? []) {
      buildingMap.set(b.id, { id: b.id, name: b.name, administration_id: b.administration_id });
    }
  }

  const administrationIds = [
    ...new Set(
      [...buildingMap.values()]
        .map((b) => b.administration_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const administrationMap = new Map<string, { id: string; company_name: string }>();
  if (administrationIds.length > 0) {
    const { data: administrations } = await supabase
      .from('administrations')
      .select('id, company_name')
      .in('id', administrationIds);
    for (const a of administrations ?? []) {
      administrationMap.set(a.id, { id: a.id, company_name: a.company_name });
    }
  }

  // Batch-fetch equipment_update snapshots for equipment_update tickets.
  // RLS ensures the installer can only see snapshots for their own assigned tickets.
  const equipmentUpdateTicketIds = rows
    .filter((r) => r.category === 'equipment_update')
    .map((r) => r.id);

  const snapshotMap = new Map<string, EquipmentUpdateSnapshot>();
  if (equipmentUpdateTicketIds.length > 0) {
    const { data: snapshots } = await supabase
      .schema('support')
      .from('equipment_updates')
      .select('id, ticket_id, equipment_id, mdb_storage_path, keys_to_activate, keys_to_disable')
      .in('ticket_id', equipmentUpdateTicketIds);
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
  }

  // Batch-fetch product names for tickets that link to a technical_order_item —
  // used as the model placeholder when the operator leaves it blank.
  const toiIds = [
    ...new Set(
      rows
        .map((r) => r.technical_order_item_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const productNameByToiId = new Map<string, string>();
  if (toiIds.length > 0) {
    const { data: items } = await supabase
      .from('technical_order_items')
      .select('id, product_id')
      .in('id', toiIds);
    const productIds = [
      ...new Set(
        (items ?? [])
          .map((i) => i.product_id)
          .filter((v): v is string => Boolean(v)),
      ),
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
  }

  return rows.map((r) => {
    const buildingInfo = r.building_id ? buildingMap.get(r.building_id) : undefined;
    const administration = buildingInfo?.administration_id
      ? administrationMap.get(buildingInfo.administration_id)
      : undefined;

    return {
      id: r.id,
      // title maps to description (no separate title column in DB)
      title: r.description,
      description: r.description,
      status: r.status as 'open' | 'in_progress',
      category: r.category,
      opened_at: r.opened_at,
      building: buildingInfo
        ? {
            id: buildingInfo.id,
            name: buildingInfo.name,
            administration: administration ?? { id: '', company_name: '' },
          }
        : { id: '', name: '', administration: { id: '', company_name: '' } },
      equipmentUpdateSnapshot: r.category === 'equipment_update'
        ? (snapshotMap.get(r.id) ?? null)
        : undefined,
      pending_new_serial: r.pending_new_serial,
      pending_new_model: r.pending_new_model,
      intended_product_name: r.technical_order_item_id
        ? productNameByToiId.get(r.technical_order_item_id) ?? null
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssignedTickets(): UseQueryResult<AssignedTicket[]> {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  const query = useQuery({
    queryKey: assignedTicketsKey(staffId),
    queryFn: () => fetchAssignedTickets(staffId),
    enabled: !!staffId,
  });

  useEffect(() => {
    if (!staffId) return;

    let channel = supabase
      .channel(`assigned-tickets-${staffId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'support',
          table: 'tickets',
          filter: `assigned_to_staff_id=eq.${staffId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
        },
      );

    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR') {
        log.warn('Realtime filter rejected, re-subscribing filterless.', err);
        void supabase.removeChannel(channel);

        // Re-subscribe without filter; query's own WHERE clause scopes the data
        channel = supabase
          .channel(`assigned-tickets-filterless-${staffId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'support', table: 'tickets' },
            () => {
              void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
            },
          )
          .subscribe();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffId, queryClient]);

  return query;
}
