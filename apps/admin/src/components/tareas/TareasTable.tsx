import { PencilLine } from 'lucide-react';
import { DataTable, type DataTableAction } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { TareaStatusBadge } from './TareaStatusBadge';
import type { TareaRow } from '@/hooks/useTareas';

interface TareasTableProps {
  rows: TareaRow[];
  isFetching: boolean;
  hasFilters: boolean;
  onEdit?: (tarea: TareaRow) => void;
}

const CATEGORY_LABELS: Record<TareaRow['category'], string> = {
  install_equipment: 'Instalación de equipo',
  replace_equipment: 'Cambio de equipo',
  update_equipment: 'Actualización de equipo',
  maintain_equipment: 'Mantenimiento',
};

export function TareasTable({
  rows,
  isFetching,
  hasFilters,
  onEdit,
}: TareasTableProps) {
  const actions: DataTableAction<TareaRow>[] | undefined = onEdit
    ? [
        {
          icon: PencilLine,
          label: (tarea) => `Editar a ${tarea.ticket_number}`,
          onClick: (tarea) => onEdit(tarea),
        },
      ]
    : undefined;

  return (
    <DataTable<TareaRow>
      rows={rows}
      isFetching={isFetching}
      columns={[
        { header: 'Ticket', cell: (tarea) => tarea.ticket_number },
        {
          header: 'Descripción',
          cell: (tarea) => (
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {tarea.description}
            </p>
          ),
          hideBelow: 'lg',
        },
        {
          header: 'Edificio',
          cell: (tarea) => (
            <div className="flex flex-col">
              <span className="text-sm">{tarea.building?.name ?? '—'}</span>
              {tarea.building?.administration?.company_name != null && (
                <span className="text-xs text-muted-foreground">
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
          cell: (tarea) => CATEGORY_LABELS[tarea.category],
          className: 'text-muted-foreground',
          hideBelow: 'sm',
        },
        {
          header: 'Estado',
          cell: (tarea) => <TareaStatusBadge status={tarea.status} />,
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
      actions={actions}
      emptyMessage="No hay tareas registradas."
      filteredEmptyMessage="No se encontraron tareas con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
