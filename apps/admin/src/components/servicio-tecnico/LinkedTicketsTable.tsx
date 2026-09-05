import { DataTable } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { tareaStatus } from '@/lib/status/tareaStatus';
import type { TechnicalOrderTicketRow } from '@/hooks/useTechnicalOrderTickets';
import { useStaffByIds } from '@/hooks/useStaffByIds';

interface LinkedTicketsTableProps {
  tickets: TechnicalOrderTicketRow[];
  /** Loading state — renders skeleton. */
  isLoading?: boolean;
}

/**
 * Read-only table of support.tickets linked to a technical order.
 * Consumes TechnicalOrderTicketRow (from useTechnicalOrderTickets, scoped to the
 * technical-orders bounded context — no legacy order_item_id alias).
 *
 * The first cell ("Nro de Tarea") links to /tareas/:id, the task detail route
 * that reads the same support.tickets row. assigned_to_staff_id is resolved to
 * the staff full name via useStaffByIds; rows without a resolvable assignee
 * render "—".
 */
export function LinkedTicketsTable({ tickets, isLoading = false }: LinkedTicketsTableProps) {
  const staffIds = tickets
    .map((t) => t.assigned_to_staff_id)
    .filter((id): id is string => Boolean(id));
  const { data: staffMap } = useStaffByIds(staffIds);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="bg-muted h-8 w-full animate-pulse rounded-md" />
        <div className="bg-muted h-8 w-full animate-pulse rounded-md" />
        <div className="bg-muted h-8 w-full animate-pulse rounded-md" />
      </div>
    );
  }

  return (
    <DataTable<TechnicalOrderTicketRow>
      rows={tickets}
      isFetching={false}
      columns={[
        {
          header: 'Nro de Tarea',
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
          cell: (t) =>
            t.assigned_to_staff_id
              ? (staffMap?.get(t.assigned_to_staff_id)?.full_name ?? '—')
              : '—',
          className: 'text-muted-foreground text-xs',
          hideBelow: 'lg',
        },
        {
          header: 'Estado',
          cell: (t) => <tareaStatus.Badge status={t.status} />,
        },
        {
          header: 'Creado',
          cell: (t) => formatDate(t.created_at),
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
      ]}
      rowKey={(t) => t.id}
      firstCell="link"
      getRowHref={(t) => `/tareas/${t.id}`}
      emptyMessage="Sin tareas"
    />
  );
}
