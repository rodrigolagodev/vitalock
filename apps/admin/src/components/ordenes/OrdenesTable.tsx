import { DataTable, Badge } from '@vitalock/ui';
import { OrdenStatusBadge } from './OrdenStatusBadge';
import type { OrdenRow, OrderType } from '@/hooks/useOrdens';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  keys: 'Llaves',
  technical: 'Servicio técnico',
};

interface OrdenesTableProps {
  ordenes: OrdenRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function clientLabel(orden: OrdenRow): string {
  if (orden.client_type === 'administration') {
    return orden.administrations?.company_name ?? '—';
  }
  return orden.particular_full_name ?? '—';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function OrdenesTable({
  ordenes,
  isFetching,
  hasFilters = false,
}: OrdenesTableProps) {
  return (
    <DataTable<OrdenRow>
      rows={ordenes}
      isFetching={isFetching}
      columns={[
        { header: 'N.º de orden', cell: (orden) => orden.order_number },
        {
          header: 'Tipo',
          cell: (orden) => (
            <Badge variant="outline">{ORDER_TYPE_LABELS[orden.order_type]}</Badge>
          ),
        },
        {
          header: 'Cliente',
          cell: (orden) => clientLabel(orden),
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
        {
          header: 'Ítems',
          cell: (orden) => orden.order_items.length,
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
        {
          header: 'Estado',
          cell: (orden) => <OrdenStatusBadge status={orden.status} />,
        },
        {
          header: 'Fecha',
          cell: (orden) => formatDate(orden.created_at),
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
      ]}
      rowKey={(orden) => orden.id}
      firstCell="link"
      getRowHref={(orden) => `/ordenes/${orden.id}`}
      emptyMessage="No hay órdenes registradas."
      filteredEmptyMessage="No se encontraron órdenes con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
