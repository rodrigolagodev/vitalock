import { DataCardList } from '@vitalock/ui';
import { categoryIcon, categoryLabel, tareaStatus } from '@/lib/status/tareaStatus';
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
 * Card list of the installer's assigned tasks, one card per ticket linking
 * to its detail at /tareas/:id. `DataCardList` renders every column at every
 * width, so the building name only ever appears once — in the Edificio
 * meta field, not repeated as a hand-rolled sub-line under the title.
 *
 * The card title is the ticket's `category` (via `categoryLabel`), not its
 * free-text `title`/`description` — the admin's description is inconsistent
 * prose, while the category is a small controlled vocabulary. A decorative
 * `card: 'icon'` column (via `categoryIcon`) renders next to the title so
 * the task type is scannable before reading any text.
 */
export function TareasTable({ rows, isLoading }: TareasTableProps) {
  return (
    <DataCardList<AssignedTicket>
      rows={rows}
      isFetching={isLoading}
      columns={[
        {
          header: 'Tarea',
          cell: (ticket) => categoryLabel(ticket.category),
        },
        {
          header: 'Tipo',
          cell: (ticket) => {
            const Icon = categoryIcon(ticket.category);
            return <Icon aria-hidden="true" className="text-muted-foreground h-5 w-5" />;
          },
          card: 'icon',
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
          card: 'status',
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
