import { DataTable, StatusBadge, type StatusTone } from '@vitalock/ui';
import type { TechnicalOrderItemRow } from '@/hooks/useTechnicalOrder';

// Technical order item status: 4-state domain (no 'configured', no 'ready_for_pickup').
const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En proceso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const ITEM_STATUS_TONES: Record<string, StatusTone> = {
  pending: 'neutral',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

// item_type domain for technical_order_items (spec #220).
const ITEM_TYPE_LABELS: Record<string, string> = {
  equipment: 'Equipo',
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
  equipment_replacement: 'Reemplazo de equipo',
};

interface TechnicalOrderItemsTableProps {
  items: TechnicalOrderItemRow[];
  /** Loading state — renders the DataTable pulse skeleton. */
  isFetching?: boolean;
}

/**
 * Read-only table for technical_order_items.
 *
 * Intent fields (intended_equipment_id / intended_assignee_staff_id) are shown
 * as raw UUIDs — a name lookup would require additional queries per item row
 * (equipment lives in operations.equipment, scoped by building; staff lives in
 * identity.staff). Displaying raw UUIDs is acceptable at this slice and is
 * flagged as a deviation in apply-progress. Resolved names are a PR-8c+ concern.
 *
 * No configure/pickup actions: technical items advance via linked tickets only.
 */
export function TechnicalOrderItemsTable({
  items,
  isFetching = false,
}: TechnicalOrderItemsTableProps) {
  return (
    <DataTable<TechnicalOrderItemRow>
      rows={items}
      isFetching={isFetching}
      columns={[
        {
          header: 'Tipo',
          cell: (item) => (
            <StatusBadge tone="neutral">
              {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
            </StatusBadge>
          ),
        },
        {
          header: 'Cant.',
          cell: (item) => item.quantity,
          className: 'text-right',
        },
        {
          header: 'Descripción',
          cell: (item) => item.description ?? '—',
          className: 'text-muted-foreground',
        },
        {
          header: 'Equipo previsto',
          cell: (item) => item.intended_equipment_id ?? '—',
          className: 'text-muted-foreground text-xs',
          hideBelow: 'lg',
        },
        {
          header: 'Asignado a',
          cell: (item) => item.intended_assignee_staff_id ?? '—',
          className: 'text-muted-foreground text-xs',
          hideBelow: 'lg',
        },
        {
          header: 'Estado',
          cell: (item) => (
            <StatusBadge tone={ITEM_STATUS_TONES[item.status] ?? 'neutral'}>
              {ITEM_STATUS_LABELS[item.status] ?? item.status}
            </StatusBadge>
          ),
        },
      ]}
      rowKey={(item) => item.id}
      emptyMessage="Sin ítems"
    />
  );
}
