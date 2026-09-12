import { DataTable } from '@vitalock/ui';
import { categoryLabel, tareaStatus } from '@/lib/status/tareaStatus';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface TareasTableProps {
  rows: AssignedTicket[];
  /** Initial load only — background refetches keep the rows on screen. */
  isLoading: boolean;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return isNaN(date.getTime()) ? iso : date.toLocaleDateString('es-AR');
}

/**
 * Flat list of the installer's assigned tasks, one row per ticket linking to
 * its detail at /tareas/:id. Secondary columns collapse on narrow screens;
 * the building name is repeated under the title there so the row still
 * answers "where do I go" on a phone.
 */
export function TareasTable({ rows, isLoading }: TareasTableProps) {
  return (
    <DataTable<AssignedTicket>
      rows={rows}
      isFetching={isLoading}
      columns={[
        {
          header: 'Tarea',
          cell: (ticket) => (
            <span className="flex flex-col">
              <span>{ticket.title}</span>
              <span className="text-muted-foreground text-xs font-normal md:hidden">
                {ticket.building.name}
              </span>
            </span>
          ),
        },
        {
          header: 'Edificio',
          cell: (ticket) => (
            <div className="flex flex-col">
              <span className="text-sm">{ticket.building.name}</span>
              {ticket.building.administration.company_name && (
                <span className="text-muted-foreground text-xs">
                  {ticket.building.administration.company_name}
                </span>
              )}
            </div>
          ),
          hideBelow: 'md',
        },
        {
          header: 'Categoría',
          cell: (ticket) => categoryLabel(ticket.category),
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
        {
          header: 'Llaves',
          cell: (ticket) => {
            const snapshot = ticket.equipmentUpdateSnapshot;
            if (!snapshot) return '—';
            const activate = snapshot.keys_to_activate.length;
            const disable = snapshot.keys_to_disable.length;
            if (activate + disable === 0) return '—';
            return (
              <span>
                {activate} alta / {disable} baja
              </span>
            );
          },
          className: 'text-muted-foreground',
          hideBelow: 'sm',
        },
        {
          header: 'Estado',
          cell: (ticket) => <tareaStatus.Badge status={ticket.status} />,
        },
        {
          header: 'Abierta',
          cell: (ticket) => formatDate(ticket.opened_at),
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
      ]}
      rowKey={(ticket) => ticket.id}
      firstCell="link"
      getRowHref={(ticket) => `/tareas/${ticket.id}`}
      emptyMessage="Estás al día. No tenés tareas pendientes."
    />
  );
}
