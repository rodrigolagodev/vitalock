import { DataCardList } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { technicalOrderStatus } from '@/lib/status/technicalOrderStatus';
import type { TechnicalOrderListRow } from '@/hooks/useTechnicalOrders';

interface ServicioTecnicoTableProps {
  rows: TechnicalOrderListRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function clientLabel(row: TechnicalOrderListRow): string {
  if (row.client_type === 'administration') {
    return row.administrations?.company_name ?? '—';
  }
  return row.particular_full_name ?? '—';
}

/**
 * Card list of open technical-service orders — a worklist
 * (`TechnicalOrdersPage` filters by `STATUS_PILLS`, not a date range), not a
 * chronological history feed. No `groupBy` here on purpose, matching admin
 * `LlavesTable`'s identical flat-worklist treatment (structurally the same
 * shape: order_number title, client meta, status badge).
 */
export function ServicioTecnicoTable({
  rows,
  isFetching,
  hasFilters = false,
}: ServicioTecnicoTableProps) {
  return (
    <DataCardList<TechnicalOrderListRow>
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
          cell: (row) => row.technical_order_items.length,
          className: 'text-muted-foreground',
          hideBelow: 'lg',
        },
        {
          header: 'Estado',
          cell: (row) => <technicalOrderStatus.Badge status={row.status} />,
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
      getRowHref={(row) => `/servicio-tecnico/${row.id}`}
      emptyMessage="No hay órdenes de servicio técnico registradas."
      filteredEmptyMessage="No se encontraron órdenes con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
