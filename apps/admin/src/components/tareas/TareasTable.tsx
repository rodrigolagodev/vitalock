import { PencilLine } from 'lucide-react';
import { Button, DataCardList } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { categoryIcon, categoryLabel, tareaStatus } from '@/lib/status/tareaStatus';
import type { TareaRow } from '@/hooks/useTareas';

interface TareasTableProps {
  rows: TareaRow[];
  isFetching: boolean;
  hasFilters: boolean;
  onEdit?: (tarea: TareaRow) => void;
}

/**
 * Card list of admin's open/in-progress tasks. Unlike the installer pilot,
 * the ticket number is already a clean identifier — it stays the card
 * title. A decorative `card: 'icon'` column (via `categoryIcon`) renders
 * next to the title so the task type is scannable before reading any text;
 * the "Categoría" field stays visible as card meta (not `card: 'hidden'`)
 * so the type has a real accessible text label too, not just the
 * `aria-hidden` icon (WCAG 1.4.1 — never color/icon-only).
 */
export function TareasTable({ rows, isFetching, hasFilters, onEdit }: TareasTableProps) {
  return (
    <DataCardList<TareaRow>
      rows={rows}
      isFetching={isFetching}
      columns={[
        { header: 'Ticket', cell: (tarea) => tarea.ticket_number },
        {
          header: 'Tipo',
          cell: (tarea) => {
            const Icon = categoryIcon(tarea.category);
            return <Icon aria-hidden="true" className="text-muted-foreground h-5 w-5" />;
          },
          card: 'icon',
        },
        {
          header: 'Descripción',
          cell: (tarea) => (
            <p className="text-muted-foreground line-clamp-1 text-sm">{tarea.description}</p>
          ),
          hideBelow: 'lg',
        },
        {
          header: 'Edificio',
          cell: (tarea) => (
            <div className="flex flex-col">
              <span className="text-sm">{tarea.building?.name ?? '—'}</span>
              {tarea.building?.administration?.company_name != null && (
                <span className="text-muted-foreground text-xs">
                  {tarea.building.administration.company_name}
                </span>
              )}
            </div>
          ),
          hideBelow: 'md',
        },
        {
          header: 'Asignado a',
          cell: (tarea) => tarea.assigned_to_name ?? 'Sin asignar',
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
        {
          header: 'Categoría',
          cell: (tarea) => categoryLabel(tarea.category),
          className: 'text-muted-foreground',
          hideBelow: 'sm',
        },
        {
          header: 'Estado',
          cell: (tarea) => <tareaStatus.Badge status={tarea.status} />,
          card: 'status',
        },
        {
          header: 'Abierta',
          cell: (tarea) => formatDate(tarea.opened_at),
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
      ]}
      rowKey={(tarea) => tarea.id}
      firstCell="link"
      getRowHref={(tarea) => `/tareas/${tarea.id}`}
      renderActions={
        onEdit
          ? (tarea) => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                aria-label={`Editar a ${tarea.ticket_number}`}
                onClick={() => onEdit(tarea)}
              >
                <PencilLine className="h-4 w-4" />
                Editar
              </Button>
            )
          : undefined
      }
      emptyMessage="No hay tareas registradas."
      filteredEmptyMessage="No se encontraron tareas con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
