import { DataTable, StatusBadge } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { keyOrderStatusLabel, keyOrderStatusTone } from '@/lib/status/keyOrderStatus';
import {
  technicalOrderStatusLabel,
  technicalOrderStatusTone,
} from '@/lib/status/technicalOrderStatus';
import type { AllOrderRow } from '@/hooks/useAllOrders';

interface HistorialTableProps {
  orders: AllOrderRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function OrderKindBadge({ kind }: { kind: AllOrderRow['order_kind'] }) {
  if (kind === 'key') {
    return <Badge variant="secondary">Llaves</Badge>;
  }
  return <Badge variant="secondary">Servicio técnico</Badge>;
}

function AllOrderStatusBadge({ row }: { row: AllOrderRow }) {
  const tone =
    row.order_kind === 'key'
      ? keyOrderStatusTone(row.status)
      : technicalOrderStatusTone(row.status);
  const label =
    row.order_kind === 'key'
      ? keyOrderStatusLabel(row.status)
      : technicalOrderStatusLabel(row.status);
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export function HistorialTable({ orders, isFetching, hasFilters = false }: HistorialTableProps) {
  return (
    <DataTable<AllOrderRow>
      rows={orders}
      isFetching={isFetching}
      columns={[
        { header: 'N.º de orden', cell: (row) => row.order_number },
        {
          header: 'Tipo',
          cell: (row) => <OrderKindBadge kind={row.order_kind} />,
        },
        {
          header: 'Estado',
          cell: (row) => <AllOrderStatusBadge row={row} />,
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
      getRowHref={(row) =>
        row.order_kind === 'key' ? `/llaves/${row.id}` : `/servicio-tecnico/${row.id}`
      }
      emptyMessage="No hay órdenes en el historial."
      filteredEmptyMessage="No se encontraron órdenes con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
