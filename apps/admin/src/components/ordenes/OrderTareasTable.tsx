import { DataTable } from '@vitalock/ui';
import { CATEGORY_LABELS } from './categoryLabels';
import { TareaStatusBadge } from '@/components/tareas/TareaStatusBadge';
import type { OrderTareaRow } from '@/hooks/useOrderTareas';

interface OrderTareasTableProps {
  tareas: OrderTareaRow[];
  /** Loading state — renders the DataTable pulse skeleton. */
  isFetching?: boolean;
}

/**
 * Tickets/tareas linked to a technical order. First cell is a link to the
 * tarea detail route, per the first-column rule (tareas have a detail route).
 */
export function OrderTareasTable({ tareas, isFetching = false }: OrderTareasTableProps) {
  return (
    <DataTable<OrderTareaRow>
      rows={tareas}
      isFetching={isFetching}
      columns={[
        { header: 'N.º', cell: (tarea) => tarea.ticket_number },
        {
          header: 'Categoría',
          cell: (tarea) => CATEGORY_LABELS[tarea.category] ?? tarea.category,
          className: 'text-muted-foreground',
        },
        {
          header: 'Descripción',
          cell: (tarea) => tarea.description,
          className: 'text-muted-foreground',
        },
        { header: 'Estado', cell: (tarea) => <TareaStatusBadge status={tarea.status} /> },
      ]}
      rowKey={(tarea) => tarea.id}
      firstCell="link"
      getRowHref={(tarea) => `/tareas/${tarea.id}`}
      emptyMessage="No hay tareas generadas para esta orden."
    />
  );
}
