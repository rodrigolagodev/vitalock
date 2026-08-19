import { DataTable } from '@vitalock/ui';
import { KeyOrderStatusBadge } from './KeyOrderStatusBadge';
import type { KeyOrderListRow } from '@/hooks/useKeyOrders';

interface LlavesTableProps {
  rows: KeyOrderListRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function clientLabel(row: KeyOrderListRow): string {
  if (row.client_type === 'administration') {
    return row.administrations?.company_name ?? '—';
  }
  return row.particular_full_name ?? '—';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function LlavesTable({
  rows,
  isFetching,
  hasFilters = false,
}: LlavesTableProps) {
  return (
    <DataTable<KeyOrderListRow>
      rows={rows}
      isFetching={isFetching}
      columns={[
        { header: 'N.º de orden', cell: (row) => row.order_number },
        {
          header: 'Cliente',
          cell: (row) => clientLabel(row),
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
        {
          header: 'Ítems',
          cell: (row) => row.key_order_items.length,
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
        {
          header: 'Estado',
          cell: (row) => <KeyOrderStatusBadge status={row.status} />,
        },
        {
          header: 'Fecha',
          cell: (row) => formatDate(row.created_at),
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
      ]}
      rowKey={(row) => row.id}
      firstCell="link"
      getRowHref={(row) => `/llaves/${row.id}`}
      emptyMessage="No hay órdenes de llave registradas."
      filteredEmptyMessage="No se encontraron órdenes con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
