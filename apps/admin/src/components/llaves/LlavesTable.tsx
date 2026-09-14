import { DataCardList } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { keyOrderStatus } from '@/lib/status/keyOrderStatus';
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

/**
 * Card list of open key orders — a worklist (`KeyOrdersPage` filters by
 * `STATUS_PILLS`, not a date range), not a chronological history feed. No
 * `groupBy` here on purpose: `HistorialTable` is the dedicated grouped view
 * for closed/all orders, so this stays a flat list like installer's
 * `TareasTable` and admin's `EquipmentUpdateHistoryPanel`.
 */
export function LlavesTable({ rows, isFetching, hasFilters = false }: LlavesTableProps) {
  return (
    <DataCardList<KeyOrderListRow>
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
          cell: (row) => <keyOrderStatus.Badge status={row.status} />,
          card: 'status',
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
