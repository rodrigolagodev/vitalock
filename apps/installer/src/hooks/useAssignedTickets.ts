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
  category: 'install_equipment' | 'replace_equipment' | 'update_equipment' | 'maintain_equipment' | string;
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

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchAssignedTickets(staffId: string): Promise<AssignedTicket[]> {
  // Single view query resolves the ticket + building + administration
  // context. support.installer_tickets_with_context (migration 000110)
  // handles the cross-schema JOIN PostgREST cannot embed directly.
  const { data, error } = await supabase
    .schema('support')
    .from('installer_tickets_with_context')
    .select(`
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
  }[];

  // Enrichment queries below are orthogonal to the tickets/building/admin
  // stitching — they hydrate category-specific side data and cannot be
  // inlined into the same view without over-fetching for the common case.

  // Batch-fetch update_equipment snapshots for update_equipment tickets.
  // RLS ensures the installer can only see snapshots for their own assigned tickets.
  const equipmentUpdateTicketIds = rows
    .filter((r) => r.category === 'update_equipment')
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

  return rows.map((r) => ({
    id: r.id,
    // title maps to description (no separate title column in DB)
    title: r.description,
    description: r.description,
    status: r.status as 'open' | 'in_progress',
    category: r.category,
    opened_at: r.opened_at,
    building: r.building_id
      ? {
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
        }
      : {
          id: '',
          name: '',
          address: null,
          city: null,
          administration: { id: '', company_name: '', address: null },
        },
    equipment_id: r.equipment_id,
    equipmentUpdateSnapshot: r.category === 'update_equipment'
      ? (snapshotMap.get(r.id) ?? null)
      : undefined,
    pending_new_serial: r.pending_new_serial,
    pending_new_model: r.pending_new_model,
    intended_product_name: r.technical_order_item_id
      ? productNameByToiId.get(r.technical_order_item_id) ?? null
      : null,
  }));
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
