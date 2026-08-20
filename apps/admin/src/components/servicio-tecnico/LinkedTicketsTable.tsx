import { DataTable, StatusBadge, type StatusTone } from '@vitalock/ui';
import type { OrderTareaRow } from '@/hooks/useOrderTareas';

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
};

const TICKET_STATUS_TONES: Record<string, StatusTone> = {
  open: 'neutral',
  in_progress: 'warning',
  resolved: 'success',
  cancelled: 'danger',
};

interface LinkedTicketsTableProps {
  tickets: OrderTareaRow[];
  /** Loading state — renders skeleton. */
  isLoading?: boolean;
}

/**
 * Read-only table of support.tickets linked to a technical order.
 * Consumes OrderTareaRow (from useOrderTareas which is retargeted for technical orders).
 *
 * No navigation to /tickets/:id — that route is not yet registered.
 * assigned_to_staff_id is shown as a raw UUID (name resolution requires additional
 * query against identity.staff). This is a deviation flagged in apply-progress.
 */
export function LinkedTicketsTable({ tickets, isLoading = false }: LinkedTicketsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <DataTable<OrderTareaRow>
      rows={tickets}
      isFetching={false}
      columns={[
        {
          header: 'N.º ticket',
          cell: (t) => t.ticket_number,
        },
        {
          header: 'Categoría',
          cell: (t) => t.category,
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
        {
          header: 'Descripción',
          cell: (t) => t.description ?? '—',
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
        {
          header: 'Asignado a',
          cell: (t) => t.assigned_to_staff_id ?? '—',
          className: 'text-muted-foreground text-xs',
          hideBelow: 'lg',
        },
        {
          header: 'Estado',
          cell: (t) => (
            <StatusBadge tone={TICKET_STATUS_TONES[t.status] ?? 'neutral'}>
              {TICKET_STATUS_LABELS[t.status] ?? t.status}
            </StatusBadge>
          ),
        },
        {
          header: 'Creado',
          cell: (t) =>
            new Date(t.created_at).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }),
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
      ]}
      rowKey={(t) => t.id}
      emptyMessage="Sin tickets"
    />
  );
}
